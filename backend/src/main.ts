import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import { assertRequiredConfig } from './config/validate-required-config.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService);
  assertRequiredConfig(configService);
  // 线上有反向代理(nginx/CDN),不设置的话 ThrottlerModule 会把所有请求
  // 都算到代理的 IP 上,导致按 IP 限流退化成全站共享一个额度
  app.set('trust proxy', 1);
  // 子路径部署时接口挂在前缀下(如 /api/weather),由 nginx 把外部的
  // /weather-app/api/ 转发过来。默认空,本地开发路径不变
  const apiPrefix = configService.get<string>('apiPrefix');
  if (apiPrefix) {
    app.setGlobalPrefix(apiPrefix);
  }
  // 同域子路径部署时浏览器不会发起跨域请求,这里配的值不生效也无妨;
  // 若前后端分域部署,必须设成前端的实际域名
  app.enableCors({ origin: configService.get<string>('corsOrigin') });
  await app.listen(configService.get<number>('port') ?? 3000);
}
await bootstrap();
