import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ProvidersModule } from './providers.module.js';
import { WEATHER_PROVIDERS } from './providers.tokens.js';
import { WeatherProvider } from '../interfaces/weather.interfaces.js';

describe('ProvidersModule', () => {
  it('resolves WEATHER_PROVIDERS to the Caiyun and QWeather providers, in that order', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ProvidersModule],
    }).compile();

    const providers = moduleRef.get<WeatherProvider[]>(WEATHER_PROVIDERS);

    // 这里刻意不排序:数组顺序就是 GET /weather 响应里 results 的顺序,
    // 也决定了前端顶部对比区和卡片的先后。它是契约的一部分,改动会直接改变界面
    expect(providers.map((provider) => provider.name)).toEqual(['caiyun', 'qweather']);
  });
});
