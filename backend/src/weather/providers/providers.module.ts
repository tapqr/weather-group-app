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
      // 这个数组的顺序就是 GET /weather 响应里 results 的顺序,前端顶部对比区和
      // 卡片的先后直接跟随它 —— 换句话说,调整这里会改变界面上两家的左右位置。
      // 由 providers.module.spec.ts 锁定
      provide: WEATHER_PROVIDERS,
      useFactory: (caiyun: CaiyunProvider, qweather: QWeatherProvider) => [caiyun, qweather],
      inject: [CaiyunProvider, QWeatherProvider],
    },
  ],
  exports: [WEATHER_PROVIDERS],
})
export class ProvidersModule {}
