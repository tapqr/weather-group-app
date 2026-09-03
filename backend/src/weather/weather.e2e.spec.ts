import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module.js';
import { WEATHER_PROVIDERS } from './providers/providers.tokens.js';
import { NormalizedWeather, WeatherProvider } from './interfaces/weather.interfaces.js';

// 端到端契约测试:真正走 HTTP 层(supertest),而不是像 weather.controller.spec.ts 那样
// 直接拿一个已经合法的 { lat, lon } 对象调用 controller 方法。这样才能覆盖:
// - DTO 能不能把 query string 里的字符串转成数字(@Type(() => Number) + IsLatitude)
// - 缺参数/非法参数是否真的返回 400
// - 响应体的形状(前端马上要照着这个形状写代码)
//
// 用 .overrideProvider(WEATHER_PROVIDERS) 换成假 provider,不会真的打第三方 API,
// 所以不需要 backend/.env 里的真实凭据。

function fakeWeather(provider: NormalizedWeather['provider']): NormalizedWeather {
  return {
    provider,
    updatedAt: '2026-09-02T00:00:00+08:00',
    current: { tempC: 20, feelsLikeC: 20, conditionText: '晴', humidityPercent: 50, windSpeedKph: 10 },
    hourly: [],
    daily: [],
  };
}

describe('GET /weather (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const okProvider: WeatherProvider = {
      name: 'qweather',
      getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')),
    };
    const failingProvider: WeatherProvider = {
      name: 'caiyun',
      getForecast: vi.fn().mockRejectedValue(new Error('upstream unavailable')),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WEATHER_PROVIDERS)
      .useValue([okProvider, failingProvider])
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 200 with an aggregated results array shaped for the frontend', async () => {
    const response = await request(app.getHttpServer()).get('/weather').query({ lat: 39.92, lon: 116.41 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      results: [
        { provider: 'qweather', status: 'ok', data: fakeWeather('qweather') },
        { provider: 'caiyun', status: 'error', message: expect.any(String) },
      ],
    });
  });

  it('returns 400 when lat is not a valid number', async () => {
    const response = await request(app.getHttpServer()).get('/weather').query({ lat: 'abc', lon: 116.41 });

    expect(response.status).toBe(400);
  });

  it('returns 400 when lon is missing', async () => {
    const response = await request(app.getHttpServer()).get('/weather').query({ lat: 39.92 });

    expect(response.status).toBe(400);
  });
});
