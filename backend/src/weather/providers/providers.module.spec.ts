import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ProvidersModule } from './providers.module.js';
import { WEATHER_PROVIDERS } from './providers.tokens.js';
import { WeatherProvider } from '../interfaces/weather.interfaces.js';

describe('ProvidersModule', () => {
  it('resolves WEATHER_PROVIDERS to the QWeather and Caiyun provider implementations', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), ProvidersModule],
    }).compile();

    const providers = moduleRef.get<WeatherProvider[]>(WEATHER_PROVIDERS);

    expect(providers.map((provider) => provider.name).sort()).toEqual(['caiyun', 'qweather']);
  });
});
