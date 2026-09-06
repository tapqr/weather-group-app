import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  
  // Enable CORS for frontend Vite app
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  const rawSubpath = (configService.get<string>('SUBPATH') ?? process.env.SUBPATH ?? 'agy').trim();
  const subpath = rawSubpath.replace(/^\/+|\/+$/g, '');

  if (subpath) {
    // 1. 子路径 API 重写中间件：
    // 请求路径如 /agy/api/weather/compare 时，自动重写为 /api/weather/compare
    // 兼容子路径反向代理或直接请求，现有 NestJS 控制器无需硬编码子路径
    app.use((req: Request, _res: Response, next: NextFunction) => {
      const apiPrefix = `/${subpath}/api`;
      if (req.url === apiPrefix) {
        req.url = '/api';
      } else if (req.url.startsWith(`${apiPrefix}/`) || req.url.startsWith(`${apiPrefix}?`)) {
        req.url = req.url.substring(subpath.length + 1);
      }
      next();
    });

    // 2. 静态资源与前端托管（若 frontend/dist 生产构建目录存在）
    const frontendDist = path.resolve(__dirname, '../../frontend/dist');
    if (fs.existsSync(frontendDist)) {
      const staticRoute = `/${subpath}`;
      // 托管 Vite 构建产物
      app.use(staticRoute, express.static(frontendDist));

      // SPA Fallback 模式（确保刷新或深度链接正常返回 index.html）
      app.use(staticRoute, (req: Request, res: Response, next: NextFunction) => {
        if (req.method === 'GET' && !req.url.startsWith('/api')) {
          return res.sendFile(path.join(frontendDist, 'index.html'));
        }
        next();
      });

      // 根路径访问自动跳转到 /${subpath}/
      app.use((req: Request, res: Response, next: NextFunction) => {
        if (req.url === '/' || req.url === '') {
          return res.redirect(`${staticRoute}/`);
        }
        next();
      });

      Logger.log(`📦 前端静态托管已启用: http://localhost:${configService.get<number>('PORT') || 3000}/${subpath}/`, 'Bootstrap');
    }
  }

  const port = configService.get<number>('PORT') || process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🌤️ Weather Comparison Backend is running on: http://localhost:${port}`, 'Bootstrap');
  if (subpath) {
    Logger.log(`🌐 子路径接口服务: http://localhost:${port}/${subpath}/api/weather/compare`, 'Bootstrap');
  }
}
bootstrap();

