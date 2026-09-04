import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ProvidersModule } from './providers.module.js';
import { WEATHER_PROVIDERS } from './providers.tokens.js';
import { WeatherProvider } from '../interfaces/weather.interfaces.js';
import configuration from '../../config/configuration.js';
import { QWeatherV1Provider } from './qweather/v1.provider.js';
import { QWeatherV7Provider } from './qweather/v7.provider.js';

describe('ProvidersModule', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
  });

  async function resolveProviders(apiVersion?: string) {
    process.env = { ...originalEnv };
    if (apiVersion === undefined) {
      delete process.env.QWEATHER_API_VERSION;
    } else {
      process.env.QWEATHER_API_VERSION = apiVersion;
    }
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, load: [configuration] }), ProvidersModule],
    }).compile();
    return moduleRef.get<WeatherProvider[]>(WEATHER_PROVIDERS);
  }

  // 和风的 v7 接口已被上游标记弃用,v1 是新实现;两份都留着,靠环境变量切换,
  // v1 真出问题时改一个变量就能回滚,不必回滚代码
  it('registers the v1 QWeather provider by default', async () => {
    const providers = await resolveProviders();

    expect(providers[1]).toBeInstanceOf(QWeatherV1Provider);
  });

  it('registers the v7 QWeather provider when QWEATHER_API_VERSION says so', async () => {
    const providers = await resolveProviders('v7');

    expect(providers[1]).toBeInstanceOf(QWeatherV7Provider);
  });

  // 两个版本对外都叫 'qweather' —— 切回 v7 不改 GET /weather 的契约,前端无感
  it('keeps the provider name stable on v7, so switching versions does not change the response contract', async () => {
    const providers = await resolveProviders('v7');

    expect(providers.map((provider) => provider.name)).toEqual(['caiyun', 'qweather']);
  });

  // 写错版本号时静默退回默认值,等于让人以为回滚生效了、其实没有
  it('refuses to start on an unrecognized version instead of silently falling back', async () => {
    await expect(resolveProviders('v2')).rejects.toThrow(/QWEATHER_API_VERSION/);
  });

  it('resolves WEATHER_PROVIDERS to the Caiyun and QWeather providers, in that order', async () => {
    const providers = await resolveProviders();

    // 这里刻意不排序:数组顺序就是 GET /weather 响应里 results 的顺序,
    // 也决定了前端顶部对比区和卡片的先后。它是契约的一部分,改动会直接改变界面
    expect(providers.map((provider) => provider.name)).toEqual(['caiyun', 'qweather']);
  });
});
