import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { QWeatherV1Provider } from './qweather/v1.provider.js';
import { QWeatherV7Provider } from './qweather/v7.provider.js';
import { CaiyunProvider } from './caiyun.provider.js';
import { WEATHER_PROVIDERS } from './providers.tokens.js';

@Module({
  imports: [HttpModule],
  providers: [
    QWeatherV1Provider,
    QWeatherV7Provider,
    CaiyunProvider,
    {
      // 这个数组的顺序就是 GET /weather 响应里 results 的顺序,前端顶部对比区和
      // 卡片的先后直接跟随它 —— 换句话说,调整这里会改变界面上两家的左右位置。
      // 由 providers.module.spec.ts 锁定
      provide: WEATHER_PROVIDERS,
      useFactory: (
        config: ConfigService,
        caiyun: CaiyunProvider,
        v1: QWeatherV1Provider,
        v7: QWeatherV7Provider,
      ) => {
        // 版本写错时宁可起不来:静默退回默认值会让人以为回滚生效了,其实没有
        const version = config.get<string>('qweather.apiVersion');
        if (version !== 'v1' && version !== 'v7') {
          throw new Error(`QWEATHER_API_VERSION must be 'v1' or 'v7'`);
        }
        return [caiyun, version === 'v7' ? v7 : v1];
      },
      inject: [ConfigService, CaiyunProvider, QWeatherV1Provider, QWeatherV7Provider],
    },
  ],
  exports: [WEATHER_PROVIDERS],
})
export class ProvidersModule {}
