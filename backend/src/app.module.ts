import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { createKeyv } from '@cacheable/memory';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { WeatherModule } from './weather/weather.module.js';
import { GeoModule } from './geo/geo.module.js';

// 这一个缓存实例是天气和 geo 共用的:天气的 key 是调用方给的坐标(约 1.1km 一格,
// `weather:{lat}:{lon}`),geo 的 key 里既有坐标(`geo:rev:...`)也有用户输入的搜索
// 关键词(`geo:q:{关键词}`)。没有容量上限的话,堆内存会随着"见过的不同 key 数"
// 单调增长(见 CacheModule.registerAsync 里的容量上限说明);关键词那部分是用户可控
// 的无界输入,geo-search-query.dto.ts 用 @MaxLength 限了长度,但条数依然无界,所以
// 这个 LRU 上限仍然是必要的兜底
const CACHE_MAX_ENTRIES = 5000;

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: (configService: ConfigService) => ({
        // 底层是 cache-manager v7 + keyv:不传 stores 时默认落到一个裸 Map,没有容量上限,
        // 过期还是"读时才清理"——写进去再也没人读的 key 会一直占内存到进程重启。
        // `@cacheable/memory` 的 createKeyv 提供一个带 LRU 上限的 Keyv 实例作为 store,
        // 用 lruSize 给内存加一个硬上限(当前安装版本:cache-manager@7、@nestjs/cache-manager@12,
        // 两者的 CacheModuleOptions/CacheManagerOptions 都接受 `stores: Keyv | KeyvStoreAdapter | ...`)
        stores: [
          createKeyv({
            ttl: configService.get<number>('cache.ttlSeconds')! * 1000,
            lruSize: CACHE_MAX_ENTRIES,
          }),
        ],
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRootAsync({
      // ConfigModule 已经是 isGlobal,这里不需要真的导入什么,只是满足
      // ThrottlerAsyncOptions 的类型要求
      imports: [],
      useFactory: (configService: ConfigService) => [
        // 具名限流器:所有路由默认同时受两者约束,各 controller 再用 @SkipThrottle
        // 跳过不属于自己的那个。@Throttle 装饰器参数是静态的、读不到 ConfigService,
        // 所以额度只能在这里配
        {
          name: 'default',
          ttl: configService.get<number>('throttle.ttlMs')!,
          limit: configService.get<number>('throttle.limit')!,
        },
        {
          name: 'geo',
          ttl: configService.get<number>('geo.throttleTtlMs')!,
          limit: configService.get<number>('geo.throttleLimit')!,
        },
      ],
      inject: [ConfigService],
    }),
    WeatherModule,
    GeoModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
