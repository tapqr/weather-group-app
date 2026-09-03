import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { QWeatherProvider } from './qweather.provider.js';
import { CaiyunProvider } from './caiyun.provider.js';
import { WEATHER_PROVIDERS } from './providers.tokens.js';

@Module({
  imports: [HttpModule],
  providers: [
    QWeatherProvider,
    CaiyunProvider,
    {
      provide: WEATHER_PROVIDERS,
      useFactory: (qweather: QWeatherProvider, caiyun: CaiyunProvider) => [qweather, caiyun],
      inject: [QWeatherProvider, CaiyunProvider],
    },
  ],
  exports: [WEATHER_PROVIDERS],
})
export class ProvidersModule {}
