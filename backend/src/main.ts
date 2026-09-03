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
  app.enableCors({ origin: configService.get<string>('corsOrigin') });
  await app.listen(configService.get<number>('port') ?? 3000);
}
await bootstrap();
