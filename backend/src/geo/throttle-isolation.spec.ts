import 'reflect-metadata';
import { GeoController } from './geo.controller.js';
import { WeatherController } from '../weather/weather.controller.js';

// `@nestjs/throttler@6.5.0` 的限流 key 是按 handler 生成的(ClassName-HandlerName-limiterName-ip),
// 意味着 GeoController 和 WeatherController 默认会**同时**受两个具名限流器('default' 用于
// /weather,'geo' 用于 /geo/*)约束,除非各自用 @SkipThrottle 显式跳过不属于自己的那个
// (见 app.module.ts 里的 ThrottlerModule.forRootAsync)。这份测试守护的是那两个装饰器
// 没被误删 —— 否则测试全绿但两份限流额度会互相污染(GeoController 干扰 /weather 的额度,
// 或 WeatherController 干扰 /geo/* 的额度)。
//
// `@nestjs/throttler` 没有把 THROTTLER_SKIP 这个 key 作为公共 API 导出(index.ts 只导出了
// decorator/exception/guard/module 等,constants.ts 不在其中),所以这里硬编码它的内部值
// 'THROTTLER:SKIP'。装饰器实际写入的 metadata key 是 `THROTTLER_SKIP + 限流器名`
// (见 node_modules/@nestjs/throttler/dist/throttler.decorator.js 的 setThrottlerMetadata)。
// 如果升级 @nestjs/throttler 后这份内部实现变了,这条测试会用错误的方式失败(读不到期望的
// metadata),这是可以接受的信号——说明需要跟着新版本调整。
const THROTTLER_SKIP = 'THROTTLER:SKIP';

describe('限流器隔离:GeoController 与 WeatherController 互不干扰对方的额度', () => {
  it('GeoController 跳过 default 限流器(不占用 /weather 的额度),且不跳过 geo 限流器', () => {
    expect(Reflect.getMetadata(THROTTLER_SKIP + 'default', GeoController)).toBe(true);
    expect(Reflect.getMetadata(THROTTLER_SKIP + 'geo', GeoController)).toBeUndefined();
  });

  it('WeatherController 跳过 geo 限流器(不占用 /geo/* 的额度),且不跳过 default 限流器', () => {
    expect(Reflect.getMetadata(THROTTLER_SKIP + 'geo', WeatherController)).toBe(true);
    expect(Reflect.getMetadata(THROTTLER_SKIP + 'default', WeatherController)).toBeUndefined();
  });
});
