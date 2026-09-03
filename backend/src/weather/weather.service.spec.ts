import { Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import type { ConfigService } from '@nestjs/config';
import { WeatherService } from './weather.service.js';
import { AggregatedWeatherResponse, NormalizedWeather, WeatherProvider } from './interfaces/weather.interfaces.js';

function fakeWeather(provider: NormalizedWeather['provider']): NormalizedWeather {
  return {
    provider,
    updatedAt: '2026-09-02T00:00:00+08:00',
    current: { tempC: 20, feelsLikeC: 20, conditionText: '晴', humidityPercent: 50, windSpeedKph: 10 },
    hourly: [],
    daily: [],
  };
}

function fakeCache() {
  const store = new Map<string, AggregatedWeatherResponse>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: AggregatedWeatherResponse) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as Cache;
}

function fakeConfigService() {
  return {
    get: (key: string) => (key === 'cache.failureTtlSeconds' ? 60 : 1800),
  } as unknown as ConfigService;
}

describe('WeatherService', () => {
  // WeatherService 在 provider 失败时用 Nest Logger 记录完整原因;测试环境里静音掉它,
  // 避免每次运行都在终端打印一堆 WARN 日志
  let loggerWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    loggerWarnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    loggerWarnSpy.mockRestore();
  });

  it('returns ok results for providers that succeed and error results for providers that fail', async () => {
    const ok: WeatherProvider = { name: 'qweather', getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')) };
    const failing: WeatherProvider = {
      name: 'caiyun',
      getForecast: vi.fn().mockRejectedValue(new Error('timeout')),
    };

    const service = new WeatherService([ok, failing], fakeCache(), fakeConfigService());
    const result = await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(result.results).toEqual([
      { provider: 'qweather', status: 'ok', data: fakeWeather('qweather') },
      // 面向用户的 message 是稳定的中文文案,不是原始异常文本(原始文本只进服务端日志,
      // 避免把 URL/token 等敏感信息透传给浏览器)
      { provider: 'caiyun', status: 'error', message: '数据源暂时不可用' },
    ]);
  });

  it('logs the full failure reason server-side instead of discarding it', async () => {
    const ok: WeatherProvider = { name: 'qweather', getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')) };
    const failing: WeatherProvider = {
      name: 'caiyun',
      getForecast: vi.fn().mockRejectedValue(new Error('upstream token rejected')),
    };

    const service = new WeatherService([ok, failing], fakeCache(), fakeConfigService());
    await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('caiyun'));
    expect(loggerWarnSpy).toHaveBeenCalledWith(expect.stringContaining('upstream token rejected'));
  });

  it('returns the cached aggregated response without calling providers again for a nearby coordinate', async () => {
    const provider: WeatherProvider = {
      name: 'qweather',
      getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')),
    };
    const cache = fakeCache();

    const service = new WeatherService([provider], cache, fakeConfigService());
    await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });
    await service.getAggregatedForecast({ lat: 39.923, lon: 116.409 }); // 四舍五入后落到同一个 cache key

    expect(provider.getForecast).toHaveBeenCalledTimes(1);
  });

  it('caches an all-error aggregate with the short failure TTL so a transient outage is not sticky', async () => {
    const failing: WeatherProvider = {
      name: 'qweather',
      getForecast: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const cache = fakeCache();

    const service = new WeatherService([failing], cache, fakeConfigService());
    await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(cache.set).toHaveBeenCalledWith('weather:39.92:116.41', expect.anything(), 60 * 1000);
  });

  it('caches an aggregate containing any successful provider with the normal TTL', async () => {
    const ok: WeatherProvider = { name: 'qweather', getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')) };
    const failing: WeatherProvider = {
      name: 'caiyun',
      getForecast: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const cache = fakeCache();

    const service = new WeatherService([ok, failing], cache, fakeConfigService());
    await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(cache.set).toHaveBeenCalledWith('weather:39.92:116.41', expect.anything(), 1800 * 1000);
  });
});
