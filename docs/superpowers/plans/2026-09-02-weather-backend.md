# 天气聚合后端(NestJS) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用 NestJS 实现一个后端服务,并行请求和风天气、彩云天气两家的天气数据,归一化成统一格式返回给 H5 前端,单一数据源失败不影响另一家展示。架构上为后续接入心知天气预留扩展点。

**Architecture:** `WeatherController` 暴露 `GET /weather?lat=&lon=`;`WeatherService` 通过 DI 令牌 `WEATHER_PROVIDERS` 拿到多个 `WeatherProvider` 实现(MVP 第一期是 `QWeatherProvider`/`CaiyunProvider`),用 `Promise.allSettled` 并行调用并聚合;每个 Provider 内部也用 `settleOrDefault` 工具对自己的 current/hourly/daily 子请求做二次降级,保证单个字段权限缺失不会拖垮整个 Provider 的返回。聚合结果先查内存缓存(按经纬度四舍五入到 2 位小数为 key),命中直接返回,未命中才发起真实请求。前端是独立部署的 H5 网页(Vite + Vue3),所以后端需要显式开启 CORS。

**Tech Stack:** Node.js 22、NestJS 12、TypeScript(ESM / `nodenext`)、`@nestjs/axios`(HTTP 客户端)、`@nestjs/config`、`@nestjs/cache-manager`(v12,底层 `cache-manager` v7)、`@nestjs/throttler`(v6)、`class-validator`/`class-transformer`(DTO 校验)、**Vitest**(测试,不是 Jest)

## Global Constraints

- 项目目录:`backend/`(仓库根目录下已存在的空目录,与 `frontend/` 并列)
- Node.js ≥ 20(当前环境已验证 Node v22.22.3、npm 10.9.8 可用)
- 包管理器统一用 npm,不混用 yarn/pnpm
- **项目是 ESM(`package.json` 里 `"type": "module"`,`tsconfig.json` 用 `"module"/"moduleResolution": "nodenext"`)**——这是当前 `npx @nestjs/cli@latest`(Nest 12)脚手架的默认产物,不是可选项。由此带来两条硬性写法要求,本计划里从 Task 1 起所有代码示例都已按此书写,后续任务照抄即可,不要"纠正"回传统 CJS 写法:
  - **所有相对路径 import 必须带 `.js` 后缀**,即使源文件是 `.ts`(例:`import { X } from '../interfaces/weather.interfaces.js'`)。只有相对路径(`./`、`../`)need 加,`@nestjs/xxx`、`rxjs` 等包名 import 不受影响。
  - `main.ts` 用顶层 `await bootstrap();`(不是 `bootstrap();`)
- **测试框架是 Vitest,不是 Jest**(`tsconfig.json` 的 `types` 数组含 `vitest/globals`,`describe`/`it`/`expect`/`vi` 都是全局,不需要 import)。所有 mock 一律用 `vi.fn()`、`vi.fn().mockResolvedValue(...)` 等,不能用 `jest.fn()`(不存在这个全局)。需要给 mock 函数标类型时用 `import type { Mock } from 'vitest'`(类型不是全局的,只有运行时 API 是全局的,类型需要显式 import)。`npm test -- <文件名片段>` 等价于 `vitest run <文件名片段>`,按文件名过滤,用法和本计划里写的一致。
- 所有第三方 API Key/Token 一律通过环境变量注入,不写入代码或提交到 git;`.env` 加入 `.gitignore`,提交 `.env.example` 作为模板
- 逐日预报统一取**未来 3 天**(两家免费版能对齐的最大天数);和风天气因免费版权限更宽松,允许在其 `daily` 数组中返回更多天数据,由前端自行决定展示几天,后端不做截断
- 每个 Provider 的 HTTP 请求都要设置 8 秒超时(`timeout: 8000`),避免单个慢请求拖垮整体响应时间
- 后端需要开启 CORS,允许 `frontend/`(Vite 应用,本地开发默认端口 `5173`)跨域请求
- `WeatherProvider` 统一接口和 `WEATHER_PROVIDERS` 数组式 DI 令牌的设计,决定了后续接入心知天气(或其他数据源)只需新增一个实现并注册进数组,不改动聚合/缓存/控制器逻辑——本计划的任务拆分要保持这个扩展点清晰可辨
- **错误上报契约(2026-09-02 修正,见 Task 10)**:`Provider.getForecast` 只在"这家数据源整体不可用"时才 reject(由 `WeatherService` 映射成 `status:'error'`);只要拿到了任何一部分数据就正常 resolve(缺失的部分为 `null`/`[]`)。这条契约是前端能区分"这家挂了,显示灰色卡片"和"这家确实没这项数据"的前提。原计划让每个适配器把自己的错误全部吞掉,导致 `status:'error'` 这条分支实际不可达——那是计划自身的矛盾,已由 Task 10 修正
- 每个真实 HTTP 请求相关代码在编写完自动化测试后,要用真实申请的 API Key 跑一次手动验证(见各任务的"手动验证"步骤),不能只依赖 mock 测试就认为功能完成
- `@nestjs/throttler@6.5.0` 的 `peerDependencies` 目前还没跟上刚发布的 Nest 12(声明支持到 `^11`),`npm install` 需要加 `--legacy-peer-deps` 才能装上(Task 1 已经这样装过一次)。Task 9 真正把 `ThrottlerModule` 接入运行时之前,重新确认一下这个包在 Nest 12 下运行正常(不只是装得上),必要时用 `npm view @nestjs/throttler peerDependencies` 检查生态是否已经跟上
- **彩云天气风速单位(2026-09-02 最终审查实测确认)**:`metric`/`metric:v1`/`metric:v2` 三种单位制下 `realtime.wind.speed` 返回的都已经是 **km/h**(只有 `SI` 单位制返回的才是 m/s)。代码一度把它又乘了一次 3.6,导致彩云天气的风速在展示时比和风天气系统性偏大约 3.6 倍——这个 bug 已修复(`CaiyunProvider` 现在直接透传 `wind.speed`,不做换算)。以后如果有人想"优化"这行代码,先看这条记录,不要凭空加换算
- **彩云天气逐日 `date` 格式(2026-09-02 最终审查实测确认)**:彩云天气 `daily` 数组里的 `date` 字段实际返回的是带时间和时区偏移的 ISO 字符串(如 `"2026-09-02T00:00+08:00"`),不是纯日期;和风天气的 `fxDate` 才是纯 `"2026-09-02"`。`CaiyunProvider.mapDaily` 已经做了 `.slice(0, 10)` 截断,`NormalizedDailyEntry.date` 统一是 `YYYY-MM-DD`,前端可以直接按这个格式对齐两家的预报
- **和风天气错误上报方式(2026-09-02 最终审查实测确认)**:当前账号对应的 API 版本用的是 "Error Code v2"——失败时返回 HTTP 4xx/5xx 状态码,body 形如 `{ error: { status, title, detail, invalidParams? } }`,**不是**旧版"HTTP 200 + body 里 `code` 字段非 `'200'`"的报错方式。所以代码里不需要、也不应该加 `code !== '200'` 的检查;axios 会在这种情况下正常 reject。但 axios 的 `error.message` 只有 `"Request failed with status code 400"`,会丢掉 `error.detail` 里真正有用的说明,`QWeatherProvider` 里的 `describeUpstreamError` 工具就是为了把这段说明找回来

---

### Task 1: 项目脚手架 + 环境变量配置(ConfigModule)+ CORS

> **执行状态:已完成**(commit `3ca6790`)。以下内容保留作为本任务的权威记录(已按实际产出把 ESM 写法修正过,和仓库里的真实代码一致),供任务评审和后续任务查阅接口约定使用,不需要重新执行。

**Files:**
- Create: `backend/`(通过 Nest CLI 脚手架生成的整个项目骨架,含 `package.json`、`tsconfig.json`、`nest-cli.json`、`src/main.ts`、`src/app.module.ts`、`src/app.controller.ts`、`src/app.service.ts` 等默认文件——实际生成的是 Nest 12 的 ESM + Vitest 脚手架)
- Create: `backend/src/config/configuration.ts`
- Test: `backend/src/config/configuration.spec.ts`
- Create: `backend/.env.example`
- Create: `backend/.gitignore`(Nest CLI 这个版本的脚手架不自带,需要手写)
- Modify: `backend/src/main.ts`(从 `ConfigService` 读取端口,开启 CORS)
- Modify: `backend/src/app.module.ts`(引入 `ConfigModule.forRoot`)

**Interfaces:**
- Produces:`configuration()`(默认导出函数,返回 `{ port: number; corsOrigin: string; cache: { ttlSeconds: number }; qweather: { apiHost: string; apiKey: string }; caiyun: { token: string } }`)——后续所有任务通过 `ConfigService.get('qweather.apiHost')` 等路径读取这些值
  > **⚠️ 已被 Task 11 取代**:`cache` 的形状后来加了 `failureTtlSeconds`(见 Task 11),实际是 `cache: { ttlSeconds: number; failureTtlSeconds: number }`。上面这行是历史记录,不要照抄。

- [x] **Step 1: 用 Nest CLI 生成项目骨架**

```bash
cd /home/huangyingming/test-code/weather-app
npx -y @nestjs/cli@latest new backend --skip-git --package-manager npm
```

- [x] **Step 2: 安装本计划全程需要的额外依赖**

```bash
cd backend
npm install @nestjs/config @nestjs/axios axios @nestjs/cache-manager cache-manager @nestjs/throttler class-validator class-transformer --legacy-peer-deps
```

- [x] **Step 3: 写 `configuration.ts` 的失败测试**

```typescript
// backend/src/config/configuration.spec.ts
import configuration from './configuration.js';

describe('configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PORT: '4000',
      CORS_ORIGIN: 'http://localhost:5173',
      WEATHER_CACHE_TTL_SECONDS: '900',
      QWEATHER_API_HOST: 'abc123.re.qweatherapi.com',
      QWEATHER_API_KEY: 'qw-key',
      CAIYUN_TOKEN: 'cy-token',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reads provider credentials, cors origin, and cache settings from environment variables', () => {
    const config = configuration();
    expect(config).toEqual({
      port: 4000,
      corsOrigin: 'http://localhost:5173',
      cache: { ttlSeconds: 900 },
      qweather: { apiHost: 'abc123.re.qweatherapi.com', apiKey: 'qw-key' },
      caiyun: { token: 'cy-token' },
    });
  });
});
```

- [x] **Step 4: 运行测试确认失败**

```bash
npm test -- configuration.spec.ts
```

预期:因为 `configuration.ts` 还不存在,测试报模块找不到而失败。

- [x] **Step 5: 实现 `configuration.ts`**

```typescript
// backend/src/config/configuration.ts
export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  cache: {
    ttlSeconds: parseInt(process.env.WEATHER_CACHE_TTL_SECONDS ?? '1800', 10),
  },
  qweather: {
    apiHost: process.env.QWEATHER_API_HOST ?? '',
    apiKey: process.env.QWEATHER_API_KEY ?? '',
  },
  caiyun: {
    token: process.env.CAIYUN_TOKEN ?? '',
  },
});
```

- [x] **Step 6: 运行测试确认通过**

```bash
npm test -- configuration.spec.ts
```

预期:PASS

- [x] **Step 7: 接入 `ConfigModule`,并让 `main.ts` 读取端口 + 开启 CORS**

```typescript
// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

```typescript
// backend/src/main.ts
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  app.enableCors({ origin: configService.get<string>('corsOrigin') });
  await app.listen(configService.get<number>('port') ?? 3000);
}
await bootstrap();
```

- [x] **Step 8: 写 `.env.example` 并配置 `.gitignore`**

```
# backend/.env.example
PORT=3000
CORS_ORIGIN=http://localhost:5173
WEATHER_CACHE_TTL_SECONDS=1800
QWEATHER_API_HOST=
QWEATHER_API_KEY=
CAIYUN_TOKEN=
```

这个版本的 Nest CLI 脚手架不自带 `.gitignore`,手写一份,至少包含 `.env`、`/dist`、`/node_modules`。

- [x] **Step 9: 启动应用做一次手动验证**

```bash
cp .env.example .env
npm run start:dev
```

预期:控制台打印 Nest 应用启动日志,无报错退出(`Ctrl+C` 结束)。

- [x] **Step 10: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add backend
git commit -m "$(cat <<'EOF'
Scaffold NestJS backend with environment-driven configuration and CORS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 统一天气数据接口 + `settleOrDefault` 降级工具

**Files:**
- Create: `backend/src/weather/interfaces/weather.interfaces.ts`
- Create: `backend/src/weather/providers/settle-or-default.util.ts`
- Test: `backend/src/weather/providers/settle-or-default.util.spec.ts`

**Interfaces:**
- Consumes:(无,本任务是基础类型定义)
- Produces:
  - `WeatherQuery { lat: number; lon: number }`
  - `NormalizedCurrentWeather { tempC: number; feelsLikeC: number | null; conditionText: string; humidityPercent: number | null; windSpeedKph: number | null }`
  - `NormalizedHourlyEntry { time: string; tempC: number; conditionText: string; precipitationProbabilityPercent: number | null }`
  - `NormalizedDailyEntry { date: string; tempMinC: number; tempMaxC: number; conditionText: string; precipitationProbabilityPercent: number | null }`
  - `NormalizedWeather { provider: ProviderName; updatedAt: string; current: NormalizedCurrentWeather | null; hourly: NormalizedHourlyEntry[]; daily: NormalizedDailyEntry[] }`
  - `WeatherProvider { readonly name: ProviderName; getForecast(query: WeatherQuery): Promise<NormalizedWeather> }`
  - `ProviderResult`(联合类型,`{provider, status:'ok', data}` 或 `{provider, status:'error', message}`)
  - `AggregatedWeatherResponse { results: ProviderResult[] }`
  - `settleOrDefault<T>(task: Promise<T>, fallback: T): Promise<T>`——后续每个 Provider 都用它包裹各自的 now/hourly/daily 子请求
    > **⚠️ 已被 Task 10 取代**:`settleOrDefault` 及其所有调用点已在 Task 10 里删除(原因见 Task 10 的说明),不要照抄下面的用法。

**注意**:`ProviderName` 目前定义为 `'qweather' | 'caiyun'`。这是本任务里唯一需要在后续接入心知天气时回头补一个值(`'seniverse'`)的地方,其余所有类型和逻辑都不需要因为新增数据源而改动——这是刻意设计的扩展点。

- [x] **Step 1: 写 `settleOrDefault` 的失败测试**

```typescript
// backend/src/weather/providers/settle-or-default.util.spec.ts
import { settleOrDefault } from './settle-or-default.util.js';

describe('settleOrDefault', () => {
  it('returns the resolved value when the task succeeds', async () => {
    const result = await settleOrDefault(Promise.resolve('ok'), 'fallback');
    expect(result).toBe('ok');
  });

  it('returns the fallback value when the task rejects', async () => {
    const result = await settleOrDefault(Promise.reject(new Error('boom')), 'fallback');
    expect(result).toBe('fallback');
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- settle-or-default.util.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 `settleOrDefault`**

```typescript
// backend/src/weather/providers/settle-or-default.util.ts
export async function settleOrDefault<T>(task: Promise<T>, fallback: T): Promise<T> {
  const [result] = await Promise.allSettled([task]);
  return result.status === 'fulfilled' ? result.value : fallback;
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- settle-or-default.util.spec.ts
```

预期:PASS

- [x] **Step 5: 定义统一接口(无独立测试,类型定义在下一个任务里被消费验证)**

```typescript
// backend/src/weather/interfaces/weather.interfaces.ts
export type ProviderName = 'qweather' | 'caiyun';

export interface WeatherQuery {
  lat: number;
  lon: number;
}

export interface NormalizedCurrentWeather {
  tempC: number;
  feelsLikeC: number | null;
  conditionText: string;
  humidityPercent: number | null;
  windSpeedKph: number | null;
}

export interface NormalizedHourlyEntry {
  time: string;
  tempC: number;
  conditionText: string;
  precipitationProbabilityPercent: number | null;
}

export interface NormalizedDailyEntry {
  date: string;
  tempMinC: number;
  tempMaxC: number;
  conditionText: string;
  precipitationProbabilityPercent: number | null;
}

export interface NormalizedWeather {
  provider: ProviderName;
  updatedAt: string;
  current: NormalizedCurrentWeather | null;
  hourly: NormalizedHourlyEntry[];
  daily: NormalizedDailyEntry[];
}

export interface WeatherProvider {
  readonly name: ProviderName;
  getForecast(query: WeatherQuery): Promise<NormalizedWeather>;
}

export type ProviderResult =
  | { provider: ProviderName; status: 'ok'; data: NormalizedWeather }
  | { provider: ProviderName; status: 'error'; message: string };

export interface AggregatedWeatherResponse {
  results: ProviderResult[];
}
```

- [x] **Step 6: 提交**

```bash
git add backend/src/weather/interfaces backend/src/weather/providers/settle-or-default.util.ts backend/src/weather/providers/settle-or-default.util.spec.ts
git commit -m "$(cat <<'EOF'
Add normalized weather interfaces and settleOrDefault degradation helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 实现 `QWeatherProvider`

**Files:**
- Create: `backend/src/weather/providers/qweather.provider.ts`
- Test: `backend/src/weather/providers/qweather.provider.spec.ts`

**Interfaces:**
- Consumes:`WeatherQuery`、`NormalizedWeather`、`WeatherProvider`(来自 Task 2 `weather.interfaces.ts`)、`settleOrDefault`(来自 Task 2)、`ConfigService.get('qweather.apiHost' | 'qweather.apiKey')`(来自 Task 1)
- Produces:`QWeatherProvider`(实现 `WeatherProvider`,`name = 'qweather'`)——供 Task 5 `ProvidersModule` 组装

- [x] **Step 1: 写覆盖"正常聚合"和"部分子请求失败仍不抛错"的失败测试**

```typescript
// backend/src/weather/providers/qweather.provider.spec.ts
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { QWeatherProvider } from './qweather.provider.js';

function buildProvider(getImpl: Mock) {
  const httpService = { get: getImpl } as any;
  const configService = {
    get: (key: string) =>
      ({
        'qweather.apiHost': 'test.re.qweatherapi.com',
        'qweather.apiKey': 'test-key',
      })[key],
  } as any;
  return new QWeatherProvider(httpService, configService);
}

describe('QWeatherProvider', () => {
  it('normalizes current, hourly, and daily data from QWeather v7 responses', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(
        of({
          data: {
            code: '200',
            now: { temp: '9', feelsLike: '7', text: '晴', humidity: '35', windSpeed: '12' },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            code: '200',
            hourly: [{ fxTime: '2026-09-02T15:00+08:00', temp: '10', text: '多云', pop: '20' }],
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            code: '200',
            daily: [{ fxDate: '2026-09-02', tempMax: '15', tempMin: '5', textDay: '晴' }],
          },
        }),
      );

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.provider).toBe('qweather');
    expect(result.current).toEqual({
      tempC: 9,
      feelsLikeC: 7,
      conditionText: '晴',
      humidityPercent: 35,
      windSpeedKph: 12,
    });
    expect(result.hourly).toEqual([
      { time: '2026-09-02T15:00+08:00', tempC: 10, conditionText: '多云', precipitationProbabilityPercent: 20 },
    ]);
    expect(result.daily).toEqual([
      { date: '2026-09-02', tempMinC: 5, tempMaxC: 15, conditionText: '晴', precipitationProbabilityPercent: null },
    ]);

    const [, , dailyCallArgs] = getImpl.mock.calls;
    expect(dailyCallArgs[0]).toBe('https://test.re.qweatherapi.com/v7/weather/7d');
    expect(dailyCallArgs[1].params.location).toBe('116.41,39.92');
    expect(dailyCallArgs[1].headers).toEqual({ 'X-QW-Api-Key': 'test-key' });
  });

  it('falls back to null/empty when a sub-request fails, without throwing', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(
        of({
          data: { code: '200', now: { temp: '9', text: '晴', feelsLike: '7', humidity: '35', windSpeed: '12' } },
        }),
      )
      .mockReturnValueOnce(throwError(() => new Error('network timeout')))
      .mockReturnValueOnce(of({ data: { code: '200', daily: [] } }));

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current).not.toBeNull();
    expect(result.hourly).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- qweather.provider.spec.ts
```

预期:模块不存在,报错失败。

> **⚠️ 已被 Task 10 取代**:下面这段代码示例用 `settleOrDefault` 把每个子请求的失败都吞成 `null`/`[]`,这个设计已经在 Task 10 里推翻(`settleOrDefault` 本身也被删除了)。实际实现见仓库里的 `backend/src/weather/providers/qweather.provider.ts`,不要照抄下面的代码。

- [x] **Step 3: 实现 `QWeatherProvider`**

```typescript
// backend/src/weather/providers/qweather.provider.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  NormalizedCurrentWeather,
  NormalizedDailyEntry,
  NormalizedHourlyEntry,
  NormalizedWeather,
  WeatherProvider,
  WeatherQuery,
} from '../interfaces/weather.interfaces.js';
import { settleOrDefault } from './settle-or-default.util.js';

interface QWeatherNowResponse {
  now: { temp: string; feelsLike?: string; text: string; humidity?: string; windSpeed?: string };
}

interface QWeatherHourlyResponse {
  hourly: Array<{ fxTime: string; temp: string; text: string; pop?: string }>;
}

interface QWeatherDailyResponse {
  daily: Array<{ fxDate: string; tempMax: string; tempMin: string; textDay: string }>;
}

@Injectable()
export class QWeatherProvider implements WeatherProvider {
  readonly name = 'qweather' as const;
  private readonly apiHost: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiHost = this.configService.get<string>('qweather.apiHost') ?? '';
    this.apiKey = this.configService.get<string>('qweather.apiKey') ?? '';
  }

  async getForecast(query: WeatherQuery): Promise<NormalizedWeather> {
    const [current, hourly, daily] = await Promise.all([
      settleOrDefault(this.fetchCurrent(query), null),
      settleOrDefault(this.fetchHourly(query), []),
      settleOrDefault(this.fetchDaily(query), []),
    ]);
    return { provider: this.name, updatedAt: new Date().toISOString(), current, hourly, daily };
  }

  private location(query: WeatherQuery): string {
    return `${query.lon},${query.lat}`;
  }

  private headers() {
    return { 'X-QW-Api-Key': this.apiKey };
  }

  private async fetchCurrent(query: WeatherQuery): Promise<NormalizedCurrentWeather> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherNowResponse>(`https://${this.apiHost}/v7/weather/now`, {
        params: { location: this.location(query) },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    const { now } = response.data;
    return {
      tempC: Number(now.temp),
      feelsLikeC: now.feelsLike ? Number(now.feelsLike) : null,
      conditionText: now.text,
      humidityPercent: now.humidity ? Number(now.humidity) : null,
      windSpeedKph: now.windSpeed ? Number(now.windSpeed) : null,
    };
  }

  private async fetchHourly(query: WeatherQuery): Promise<NormalizedHourlyEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherHourlyResponse>(`https://${this.apiHost}/v7/weather/24h`, {
        params: { location: this.location(query) },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    return response.data.hourly.map((entry) => ({
      time: entry.fxTime,
      tempC: Number(entry.temp),
      conditionText: entry.text,
      precipitationProbabilityPercent: entry.pop ? Number(entry.pop) : null,
    }));
  }

  private async fetchDaily(query: WeatherQuery): Promise<NormalizedDailyEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherDailyResponse>(`https://${this.apiHost}/v7/weather/7d`, {
        params: { location: this.location(query) },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    // QWeather v7 的 daily 接口只有降水量(precip, mm),没有降水概率字段,如实标记为 null
    return response.data.daily.map((entry) => ({
      date: entry.fxDate,
      tempMinC: Number(entry.tempMin),
      tempMaxC: Number(entry.tempMax),
      conditionText: entry.textDay,
      precipitationProbabilityPercent: null,
    }));
  }
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- qweather.provider.spec.ts
```

预期:PASS

- [x] **Step 5: 手动验证(需要真实和风天气 Key)**

1. 去 `console.qweather.com` 注册个人开发者账号,创建项目,选择"免费订阅",获取专属 API Host 和 API Key
2. 把真实值填入 `backend/.env` 的 `QWEATHER_API_HOST`、`QWEATHER_API_KEY`
3. 启动应用 `npm run start:dev`
4. 在另一个终端里对着一个真实 provider 测试脚本或临时在 `AppController` 里加一行调试代码调用 `QWeatherProvider.getForecast({lat: 39.92, lon: 116.41})`,确认能拿到北京真实天气数据(完成后记得去掉调试代码,不要提交)

- [x] **Step 6: 提交**

```bash
git add backend/src/weather/providers/qweather.provider.ts backend/src/weather/providers/qweather.provider.spec.ts
git commit -m "$(cat <<'EOF'
Add QWeatherProvider with graceful per-field degradation

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 实现 `CaiyunProvider`(含分钟级降水权限手动核实)

**Files:**
- Create: `backend/src/weather/providers/caiyun.provider.ts`
- Test: `backend/src/weather/providers/caiyun.provider.spec.ts`

**Interfaces:**
- Consumes:`WeatherQuery`、`NormalizedWeather`、`WeatherProvider`(来自 Task 2)、`ConfigService.get('caiyun.token')`(来自 Task 1)。**不消费** `settleOrDefault`——彩云天气用一个组合接口一次拿到 realtime/hourly/daily,失败是整体性的,用 try/catch 处理即可,不需要逐字段降级
  > **⚠️ 已被 Task 10 取代**:这里的 try/catch 整体吞错设计已在 Task 10 里移除——彩云天气整体请求失败时改为直接向上 reject(让 `WeatherService` 映射成 `status:'error'`),不再吞成空结果。
- Produces:`CaiyunProvider`(实现 `WeatherProvider`,`name = 'caiyun'`)——供 Task 5 `ProvidersModule` 组装

- [x] **Step 1: 写测试,覆盖 skycon 转文字、单位换算、经纬度顺序、整体失败降级**

```typescript
// backend/src/weather/providers/caiyun.provider.spec.ts
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { CaiyunProvider } from './caiyun.provider.js';

function buildProvider(getImpl: Mock) {
  const httpService = { get: getImpl } as any;
  const configService = { get: () => 'test-token' } as any;
  return new CaiyunProvider(httpService, configService);
}

describe('CaiyunProvider', () => {
  it('normalizes the combined weather response, converting skycon codes and m/s to km/h', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({
        data: {
          status: 'ok',
          result: {
            realtime: {
              temperature: 9,
              apparent_temperature: 7,
              humidity: 0.35,
              skycon: 'CLEAR_DAY',
              wind: { speed: 2 },
            },
            hourly: {
              temperature: [{ datetime: '2026-09-02T15:00+08:00', value: 10 }],
              skycon: [{ datetime: '2026-09-02T15:00+08:00', value: 'PARTLY_CLOUDY_DAY' }],
              precipitation: [{ datetime: '2026-09-02T15:00+08:00', value: 0, probability: 20 }],
            },
            daily: {
              temperature: [{ date: '2026-09-02', max: 15, min: 5 }],
              skycon: [{ date: '2026-09-02', value: 'CLEAR_DAY' }],
              precipitation: [{ date: '2026-09-02', probability: 10 }],
            },
          },
        },
      }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.provider).toBe('caiyun');
    expect(result.current).toEqual({
      tempC: 9,
      feelsLikeC: 7,
      conditionText: '晴',
      humidityPercent: 35,
      windSpeedKph: 7.2,
    });
    // 注意:上面 humidity 用 0.35 是能整除的"幸运值",务必再补一个不能整除的用例
    // (如 0.29)断言 humidityPercent === 29,否则四舍五入缺失时测试发现不了
    expect(result.hourly).toEqual([
      { time: '2026-09-02T15:00+08:00', tempC: 10, conditionText: '多云', precipitationProbabilityPercent: 20 },
    ]);
    expect(result.daily).toEqual([
      { date: '2026-09-02', tempMinC: 5, tempMaxC: 15, conditionText: '晴', precipitationProbabilityPercent: 10 },
    ]);

    const [callArgs] = getImpl.mock.calls;
    // URL 路径里经纬度顺序是 "经度,纬度"(和响应体 JSON 里的 [纬度,经度] 相反)
    expect(callArgs[0]).toBe('https://api.caiyunapp.com/v2.6/test-token/116.41,39.92/weather');
  });

  it('falls back to null/empty current and daily/hourly arrays when the combined request fails', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => new Error('network timeout')));

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.provider).toBe('caiyun');
    expect(result.current).toBeNull();
    expect(result.hourly).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- caiyun.provider.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 `CaiyunProvider`**

```typescript
// backend/src/weather/providers/caiyun.provider.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { NormalizedDailyEntry, NormalizedHourlyEntry, NormalizedWeather, WeatherProvider, WeatherQuery } from '../interfaces/weather.interfaces.js';

const SKYCON_TEXT: Record<string, string> = {
  CLEAR_DAY: '晴',
  CLEAR_NIGHT: '晴',
  PARTLY_CLOUDY_DAY: '多云',
  PARTLY_CLOUDY_NIGHT: '多云',
  CLOUDY: '阴',
  LIGHT_HAZE: '轻度雾霾',
  MODERATE_HAZE: '中度雾霾',
  HEAVY_HAZE: '重度雾霾',
  LIGHT_RAIN: '小雨',
  MODERATE_RAIN: '中雨',
  HEAVY_RAIN: '大雨',
  STORM_RAIN: '暴雨',
  FOG: '雾',
  LIGHT_SNOW: '小雪',
  MODERATE_SNOW: '中雪',
  HEAVY_SNOW: '大雪',
  STORM_SNOW: '暴雪',
  DUST: '浮尘',
  SAND: '沙尘',
  WIND: '大风',
};

function skyconToText(skycon: string): string {
  return SKYCON_TEXT[skycon] ?? skycon;
}

interface CaiyunWeatherResponse {
  result: {
    realtime: { temperature: number; apparent_temperature: number; humidity: number; skycon: string; wind: { speed: number } };
    hourly: {
      temperature: Array<{ datetime: string; value: number }>;
      skycon: Array<{ datetime: string; value: string }>;
      precipitation: Array<{ datetime: string; value: number; probability: number }>;
    };
    daily: {
      temperature: Array<{ date: string; max: number; min: number }>;
      skycon: Array<{ date: string; value: string }>;
      precipitation: Array<{ date: string; probability: number }>;
    };
  };
}

@Injectable()
export class CaiyunProvider implements WeatherProvider {
  readonly name = 'caiyun' as const;
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.token = this.configService.get<string>('caiyun.token') ?? '';
  }

  async getForecast(query: WeatherQuery): Promise<NormalizedWeather> {
    try {
      const response = await firstValueFrom(
        this.httpService.get<CaiyunWeatherResponse>(
          `https://api.caiyunapp.com/v2.6/${this.token}/${query.lon},${query.lat}/weather`,
          { params: { dailysteps: 3, hourlysteps: 24, unit: 'metric:v2' }, timeout: 8000 },
        ),
      );
      const { realtime, hourly, daily } = response.data.result;
      return {
        provider: this.name,
        updatedAt: new Date().toISOString(),
        current: {
          tempC: realtime.temperature,
          feelsLikeC: realtime.apparent_temperature,
          conditionText: skyconToText(realtime.skycon),
          // 彩云天气的 humidity 是 0~1 小数,乘 100 后必须四舍五入到整数百分比,
          // 否则 0.29 * 100 会得到 28.999999999999996 这样的浮点噪声
          humidityPercent: Math.round(realtime.humidity * 100),
          // 彩云天气 metric 单位下风速为 m/s,转换为 km/h 与和风天气保持单位一致
          windSpeedKph: Math.round(realtime.wind.speed * 3.6 * 10) / 10,
        },
        hourly: this.mapHourly(hourly),
        daily: this.mapDaily(daily),
      };
    } catch {
      return { provider: this.name, updatedAt: new Date().toISOString(), current: null, hourly: [], daily: [] };
    }
  }

  private mapHourly(hourly: CaiyunWeatherResponse['result']['hourly']): NormalizedHourlyEntry[] {
    return hourly.temperature.map((entry, index) => ({
      time: entry.datetime,
      tempC: entry.value,
      conditionText: skyconToText(hourly.skycon[index].value),
      precipitationProbabilityPercent: hourly.precipitation[index]?.probability ?? null,
    }));
  }

  private mapDaily(daily: CaiyunWeatherResponse['result']['daily']): NormalizedDailyEntry[] {
    return daily.temperature.map((entry, index) => ({
      date: entry.date,
      tempMinC: entry.min,
      tempMaxC: entry.max,
      conditionText: skyconToText(daily.skycon[index].value),
      precipitationProbabilityPercent: daily.precipitation[index]?.probability ?? null,
    }));
  }
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- caiyun.provider.spec.ts
```

预期:PASS

- [x] **Step 5: 手动验证(需要真实彩云天气 Token,并核实 minutely 权限)**

1. 去 `platform.caiyunapp.com/regist` 注册开放平台账号,获取免费 token
2. 把 token 填入 `backend/.env` 的 `CAIYUN_TOKEN`
3. 启动应用,临时调用 `CaiyunProvider.getForecast({lat: 39.92, lon: 116.41})`,确认能拿到真实数据
4. **核实 minutely 权限**:用 curl 单独调用一次分钟级降水接口:
   ```bash
   curl "https://api.caiyunapp.com/v2.6/${CAIYUN_TOKEN}/116.41,39.92/minutely"
   ```
   如果返回体里 `result.minutely` 为空对象或整个请求 403/401,说明免费版确实没有这个权限,符合调研预期——不需要写任何代码,这只是确认结论,`CaiyunProvider` 保持现状(不含 minutely)即可。如果意外发现有权限返回了数据,记录下来,作为后续一个独立的"加入分钟级降水展示"任务的输入,不在本任务里追加代码。

- [x] **Step 6: 提交**

```bash
git add backend/src/weather/providers/caiyun.provider.ts backend/src/weather/providers/caiyun.provider.spec.ts
git commit -m "$(cat <<'EOF'
Add CaiyunProvider with skycon-to-text mapping and unit conversion

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 组装 `ProvidersModule`

**Files:**
- Create: `backend/src/weather/providers/providers.tokens.ts`
- Create: `backend/src/weather/providers/providers.module.ts`
- Test: `backend/src/weather/providers/providers.module.spec.ts`

**Interfaces:**
- Consumes:`QWeatherProvider`(Task 3)、`CaiyunProvider`(Task 4)
- Produces:`WEATHER_PROVIDERS`(字符串 DI 令牌)、`ProvidersModule`(导出 `WEATHER_PROVIDERS`,解析为 `WeatherProvider[]`)——供 Task 6 `WeatherService` 注入使用

- [x] **Step 1: 写测试,验证模块能解析出 2 个 Provider 且 name 正确**

```typescript
// backend/src/weather/providers/providers.module.spec.ts
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
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- providers.module.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 DI 令牌和模块**

```typescript
// backend/src/weather/providers/providers.tokens.ts
export const WEATHER_PROVIDERS = 'WEATHER_PROVIDERS';
```

```typescript
// backend/src/weather/providers/providers.module.ts
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
```

**扩展点提示**:后续接入心知天气时,这里只需要:① 新增 `SeniverseProvider` 加入 `providers` 数组和 `useFactory`/`inject`;② `providers.module.spec.ts` 的期望值加上 `'seniverse'`。`WeatherService`、`WeatherController`、缓存、限流均不需要改动。

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- providers.module.spec.ts
```

预期:PASS

- [x] **Step 5: 提交**

```bash
git add backend/src/weather/providers/providers.tokens.ts backend/src/weather/providers/providers.module.ts backend/src/weather/providers/providers.module.spec.ts
git commit -m "$(cat <<'EOF'
Wire QWeather and Caiyun providers behind a WEATHER_PROVIDERS DI token

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 实现 `WeatherService` 聚合逻辑

**Files:**
- Create: `backend/src/weather/weather.service.ts`
- Test: `backend/src/weather/weather.service.spec.ts`

**Interfaces:**
- Consumes:`WEATHER_PROVIDERS`(Task 5)、`WeatherProvider`/`AggregatedWeatherResponse`/`ProviderResult`/`WeatherQuery`(Task 2)
- Produces:`WeatherService.getAggregatedForecast(query: WeatherQuery): Promise<AggregatedWeatherResponse>`——供 Task 7 `WeatherController` 调用

- [x] **Step 1: 写测试,覆盖"部分成功部分失败"场景**

```typescript
// backend/src/weather/weather.service.spec.ts
import { WeatherService } from './weather.service.js';
import { NormalizedWeather, WeatherProvider } from './interfaces/weather.interfaces.js';

function fakeWeather(provider: NormalizedWeather['provider']): NormalizedWeather {
  return {
    provider,
    updatedAt: '2026-09-02T00:00:00+08:00',
    current: { tempC: 20, feelsLikeC: 20, conditionText: '晴', humidityPercent: 50, windSpeedKph: 10 },
    hourly: [],
    daily: [],
  };
}

describe('WeatherService', () => {
  it('returns ok results for providers that succeed and error results for providers that fail', async () => {
    const ok: WeatherProvider = { name: 'qweather', getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')) };
    const failing: WeatherProvider = {
      name: 'caiyun',
      getForecast: vi.fn().mockRejectedValue(new Error('timeout')),
    };

    const service = new WeatherService([ok, failing]);
    const result = await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(result.results).toEqual([
      { provider: 'qweather', status: 'ok', data: fakeWeather('qweather') },
      { provider: 'caiyun', status: 'error', message: 'timeout' },
    ]);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- weather.service.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 `WeatherService`(暂不含缓存,缓存留给 Task 8)**

```typescript
// backend/src/weather/weather.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { WEATHER_PROVIDERS } from './providers/providers.tokens.js';
import { AggregatedWeatherResponse, ProviderResult, WeatherProvider, WeatherQuery } from './interfaces/weather.interfaces.js';

@Injectable()
export class WeatherService {
  constructor(@Inject(WEATHER_PROVIDERS) private readonly providers: WeatherProvider[]) {}

  async getAggregatedForecast(query: WeatherQuery): Promise<AggregatedWeatherResponse> {
    const settled = await Promise.allSettled(this.providers.map((provider) => provider.getForecast(query)));

    const results: ProviderResult[] = settled.map((outcome, index) => {
      const provider = this.providers[index];
      if (outcome.status === 'fulfilled') {
        return { provider: provider.name, status: 'ok', data: outcome.value };
      }
      return {
        provider: provider.name,
        status: 'error',
        message: outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error',
      };
    });

    return { results };
  }
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- weather.service.spec.ts
```

预期:PASS

- [x] **Step 5: 提交**

```bash
git add backend/src/weather/weather.service.ts backend/src/weather/weather.service.spec.ts
git commit -m "$(cat <<'EOF'
Add WeatherService to aggregate providers via Promise.allSettled

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `WeatherController` + `WeatherModule` + 挂载到 `AppModule`

**Files:**
- Create: `backend/src/weather/dto/weather-query.dto.ts`
- Create: `backend/src/weather/weather.controller.ts`
- Test: `backend/src/weather/weather.controller.spec.ts`
- Create: `backend/src/weather/weather.module.ts`
- Modify: `backend/src/app.module.ts`(引入 `WeatherModule`)

**Interfaces:**
- Consumes:`WeatherService`(Task 6)、`ProvidersModule`(Task 5)
- Produces:`GET /weather?lat=&lon=` HTTP 端点——供 H5 前端及 Task 9 端到端验证调用

- [x] **Step 1: 写 DTO**

```typescript
// backend/src/weather/dto/weather-query.dto.ts
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

export class WeatherQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}
```

- [x] **Step 2: 写 Controller 的失败测试**

```typescript
// backend/src/weather/weather.controller.spec.ts
import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';

describe('WeatherController', () => {
  it('delegates to WeatherService.getAggregatedForecast with the parsed lat/lon', async () => {
    const aggregated = { results: [] };
    const weatherService = {
      getAggregatedForecast: vi.fn().mockResolvedValue(aggregated),
    } as unknown as WeatherService;
    const controller = new WeatherController(weatherService);

    const result = await controller.getWeather({ lat: 39.92, lon: 116.41 });

    expect(weatherService.getAggregatedForecast).toHaveBeenCalledWith({ lat: 39.92, lon: 116.41 });
    expect(result).toBe(aggregated);
  });
});
```

- [x] **Step 3: 运行测试确认失败**

```bash
npm test -- weather.controller.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 4: 实现 Controller 与 Module,挂载到 AppModule**

```typescript
// backend/src/weather/weather.controller.ts
import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { WeatherService } from './weather.service.js';
import { WeatherQueryDto } from './dto/weather-query.dto.js';
import { AggregatedWeatherResponse } from './interfaces/weather.interfaces.js';

@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  getWeather(
    @Query(new ValidationPipe({ transform: true })) query: WeatherQueryDto,
  ): Promise<AggregatedWeatherResponse> {
    return this.weatherService.getAggregatedForecast({ lat: query.lat, lon: query.lon });
  }
}
```

```typescript
// backend/src/weather/weather.module.ts
import { Module } from '@nestjs/common';
import { ProvidersModule } from './providers/providers.module.js';
import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';

@Module({
  imports: [ProvidersModule],
  controllers: [WeatherController],
  providers: [WeatherService],
})
export class WeatherModule {}
```

```typescript
// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { WeatherModule } from './weather/weather.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    WeatherModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [x] **Step 5: 运行测试确认通过**

```bash
npm test -- weather.controller.spec.ts
```

预期:PASS

- [x] **Step 6: 手动验证——启动应用真实 curl 一次**

```bash
npm run start:dev
```

另开终端:

```bash
curl "http://localhost:3000/weather?lat=39.92&lon=116.41"
```

预期:返回 JSON,`results` 数组里有两条记录,两家 `status` 都是 `ok`(前提是 Task 3/4 的手动验证步骤里已经填好两个真实 Key)。

- [x] **Step 7: 提交**

```bash
git add backend/src/weather/dto backend/src/weather/weather.controller.ts backend/src/weather/weather.controller.spec.ts backend/src/weather/weather.module.ts backend/src/app.module.ts
git commit -m "$(cat <<'EOF'
Expose GET /weather endpoint backed by WeatherService

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: 接入内存缓存

**Files:**
- Modify: `backend/src/weather/weather.service.ts`
- Modify: `backend/src/weather/weather.service.spec.ts`
- Modify: `backend/src/app.module.ts`(引入 `CacheModule.registerAsync`)

**Interfaces:**
- Consumes:`ConfigService.get('cache.ttlSeconds')`(Task 1)、`CACHE_MANAGER`(`@nestjs/cache-manager` 提供)
- Produces:`WeatherService.getAggregatedForecast` 行为不变(签名不变),但对相同经纬度(四舍五入到小数点后 2 位)在 TTL 内重复调用不会再触发真实 Provider 请求

**已核实**:项目里实际装的是 `cache-manager@7.x`(通过 `@nestjs/cache-manager@12.x`),其 `set(key, value, ttl)` 的 `ttl` 单位是**毫秒**(已读取 `node_modules/cache-manager/README.md` 确认),和下面代码里 `ttlSeconds * 1000` 的写法一致,不需要调整。

- [x] **Step 1: 用完整内容重写 `weather.service.spec.ts`**——`WeatherService` 构造函数即将多出 `cache`/`configService` 两个参数,Task 6 写的旧测试会因为参数不够而报错,所以这一步直接给出整个文件的最终内容(而不是"追加"),同时补上覆盖"缓存命中不重复调用 Provider"的新测试:

```typescript
// backend/src/weather/weather.service.spec.ts(整体替换)
import type { Cache } from 'cache-manager';
import type { ConfigService } from '@nestjs/config';
import { WeatherService } from './weather.service.js';
import { AggregatedWeatherResponse, NormalizedWeather, WeatherProvider } from './interfaces/weather.interfaces.js';

function fakeWeather(provider: NormalizedWeather['provider']): NormalizedWeather {
  return {
    provider,
    updatedAt: '2026-09-02T00:00:00+08:00',
    current: { tempC: 20, feelsLikeC: 20, conditionText: '晴', humidityPercent: 50, windSpeedKph: 10 },
    hourly: [],
    daily: [],
  };
}

function fakeCache() {
  const store = new Map<string, AggregatedWeatherResponse>();
  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key))),
    set: vi.fn((key: string, value: AggregatedWeatherResponse) => {
      store.set(key, value);
      return Promise.resolve();
    }),
  } as unknown as Cache;
}

function fakeConfigService() {
  return { get: () => 1800 } as unknown as ConfigService;
}

describe('WeatherService', () => {
  it('returns ok results for providers that succeed and error results for providers that fail', async () => {
    const ok: WeatherProvider = { name: 'qweather', getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')) };
    const failing: WeatherProvider = {
      name: 'caiyun',
      getForecast: vi.fn().mockRejectedValue(new Error('timeout')),
    };

    const service = new WeatherService([ok, failing], fakeCache(), fakeConfigService());
    const result = await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(result.results).toEqual([
      { provider: 'qweather', status: 'ok', data: fakeWeather('qweather') },
      { provider: 'caiyun', status: 'error', message: 'timeout' },
    ]);
  });

  it('returns the cached aggregated response without calling providers again for a nearby coordinate', async () => {
    const provider: WeatherProvider = {
      name: 'qweather',
      getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')),
    };
    const cache = fakeCache();

    const service = new WeatherService([provider], cache, fakeConfigService());
    await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });
    await service.getAggregatedForecast({ lat: 39.923, lon: 116.409 }); // 四舍五入后落到同一个 cache key

    expect(provider.getForecast).toHaveBeenCalledTimes(1);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- weather.service.spec.ts
```

预期:`WeatherService` 构造函数参数数量不对(旧实现只接受 1 个参数),编译/运行报错失败。

- [x] **Step 3: 给 `WeatherService` 加缓存逻辑**

```typescript
// backend/src/weather/weather.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { WEATHER_PROVIDERS } from './providers/providers.tokens.js';
import { AggregatedWeatherResponse, ProviderResult, WeatherProvider, WeatherQuery } from './interfaces/weather.interfaces.js';

@Injectable()
export class WeatherService {
  constructor(
    @Inject(WEATHER_PROVIDERS) private readonly providers: WeatherProvider[],
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
  ) {}

  async getAggregatedForecast(query: WeatherQuery): Promise<AggregatedWeatherResponse> {
    const cacheKey = this.buildCacheKey(query);
    const cached = await this.cache.get<AggregatedWeatherResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const settled = await Promise.allSettled(this.providers.map((provider) => provider.getForecast(query)));
    const results: ProviderResult[] = settled.map((outcome, index) => {
      const provider = this.providers[index];
      if (outcome.status === 'fulfilled') {
        return { provider: provider.name, status: 'ok', data: outcome.value };
      }
      return {
        provider: provider.name,
        status: 'error',
        message: outcome.reason instanceof Error ? outcome.reason.message : 'Unknown error',
      };
    });

    const response: AggregatedWeatherResponse = { results };
    const ttlSeconds = this.configService.get<number>('cache.ttlSeconds') ?? 1800;
    await this.cache.set(cacheKey, response, ttlSeconds * 1000);
    return response;
  }

  // 四舍五入到小数点后 2 位(约 1.1km 精度),避免 GPS 抖动导致缓存命中率过低
  private buildCacheKey(query: WeatherQuery): string {
    return `weather:${query.lat.toFixed(2)}:${query.lon.toFixed(2)}`;
  }
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- weather.service.spec.ts
```

预期:PASS(两个 `it` 均通过)

- [x] **Step 5: 把 `CacheModule` 接入 `AppModule`**

```typescript
// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import configuration from './config/configuration.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { WeatherModule } from './weather/weather.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: (configService: ConfigService) => ({
        ttl: (configService.get<number>('cache.ttlSeconds') ?? 1800) * 1000,
      }),
      inject: [ConfigService],
    }),
    WeatherModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

- [x] **Step 6: 手动验证缓存生效**

```bash
npm run start:dev
```

```bash
time curl "http://localhost:3000/weather?lat=39.92&lon=116.41"
time curl "http://localhost:3000/weather?lat=39.92&lon=116.41"
```

预期:第二次请求明显更快(命中缓存,没有真的再发第三方请求)。

- [x] **Step 7: 提交**

```bash
git add backend/src/weather/weather.service.ts backend/src/weather/weather.service.spec.ts backend/src/app.module.ts
git commit -m "$(cat <<'EOF'
Cache aggregated weather responses by rounded coordinates

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 接入限流 + 端到端手动验证

**Files:**
- Modify: `backend/src/app.module.ts`(引入 `ThrottlerModule` + 全局 `ThrottlerGuard`)

**Interfaces:**
- Consumes:(无新增代码接口,纯配置)
- Produces:全局请求限流(每个 IP 每 60 秒最多 30 次请求),保护后端不被刷爆导致两家免费额度被瞬间用光

- [x] **Step 1: 接入 `ThrottlerModule` 前,先确认它在 Nest 12 下能正常工作**

```bash
cd backend
npm view @nestjs/throttler peerDependencies
```

如果依然没有声明支持 Nest `^12`,继续用已经装好的版本即可(Task 1 装依赖时已经用 `--legacy-peer-deps` 装上了,这里不需要重装)——只是心里有数,如果下面的运行时验证出现异常,先怀疑这个版本兼容性问题。

- [x] **Step 2: 接入 `ThrottlerModule`**

```typescript
// backend/src/app.module.ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import configuration from './config/configuration.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { WeatherModule } from './weather/weather.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: (configService: ConfigService) => ({
        ttl: (configService.get<number>('cache.ttlSeconds') ?? 1800) * 1000,
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    WeatherModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
```

- [x] **Step 3: 手动验证限流生效**

```bash
npm run start:dev
```

另开终端,连续请求 31 次:

```bash
for i in $(seq 1 31); do curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3000/weather?lat=39.92&lon=116.41"; done
```

预期:前 30 次返回 `200`,第 31 次返回 `429`。(限流场景涉及真实时间窗口,不写自动化测试,以这次手动验证为准;这一步也顺带验证了 Step 1 里提到的 Nest 12 兼容性风险——如果 `ThrottlerModule` 和 Nest 12 有运行时不兼容,应用会在启动或请求时报错而不是安静地不限流)

- [x] **Step 4: 提交**

```bash
git add backend/src/app.module.ts
git commit -m "$(cat <<'EOF'
Add global rate limiting to protect third-party API quotas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [x] **Step 5: 端到端手动验证(收尾)**

1. 确认 `backend/.env` 里两家真实 Key/Token/Host 都已填好
2. `npm run start:dev` 启动服务
3. `curl "http://localhost:3000/weather?lat=30.27&lon=120.15"`(杭州)确认两家都返回 `status: "ok"` 且数据合理(温度在正常范围、`conditionText` 是中文)
4. 临时把 `.env` 里 `CAIYUN_TOKEN` 改成错误值,重启服务,再请求一次,确认 `results` 里彩云天气变成 `status: "error"`,而和风天气仍然是 `status: "ok"`(验证"单一数据源失败不影响另一家展示"这个核心设计目标)
5. 改回正确的 Token,重启服务,确认恢复正常
6. 从 `frontend/` 目录里用浏览器直接发一次跨域请求验证 CORS 生效(比如在浏览器 DevTools Console 里对着 `http://localhost:5173` 页面执行 `fetch('http://localhost:3000/weather?lat=39.92&lon=116.41').then(r => r.json()).then(console.log)`),确认没有 CORS 报错
7. 跑一次全量测试确保没有回归:

```bash
npm test
```

预期:全部测试 PASS。

---

### Task 10: 修正错误上报契约,让 `status:'error'` 真正可达

> **为什么有这个任务**:Task 7 完成后第一次端到端 curl 暴露出一个计划自身的矛盾——原计划一方面让 `QWeatherProvider` 用 `settleOrDefault` 把每个子请求的错误都吞成 `null`/`[]`,让 `CaiyunProvider` 用 `try/catch` 把整体错误吞成空对象,另一方面又在 `ProviderResult` 里定义了 `status:'error'` 分支并要求前端据此展示"该数据源暂时不可用"的灰色卡片。两者不可能同时成立:两个适配器的 `getForecast` 永远不 reject,`WeatherService` 的 `Promise.allSettled` 就永远只看到 `fulfilled`,`status:'error'` 实际不可达。实测证据:在没有任何 API 凭据的情况下 `curl "http://localhost:3000/weather?lat=39.92&lon=116.41"` 返回两家都是 `status:"ok"`、`current:null`、`hourly:[]`、`daily:[]`。人工裁定采用"完全拿不到数据时才报 error"方案。

**Files:**
- Modify: `backend/src/weather/providers/qweather.provider.ts`
- Modify: `backend/src/weather/providers/qweather.provider.spec.ts`
- Modify: `backend/src/weather/providers/caiyun.provider.ts`
- Modify: `backend/src/weather/providers/caiyun.provider.spec.ts`
- Delete: `backend/src/weather/providers/settle-or-default.util.ts`
- Delete: `backend/src/weather/providers/settle-or-default.util.spec.ts`

**Interfaces:**
- Consumes:`WeatherQuery`、`NormalizedWeather`、`WeatherProvider`(Task 2,不变)
- Produces:两个适配器的 `getForecast` 语义收紧为——**整体不可用时 reject,拿到任何一部分数据就 resolve**。`WeatherService`(Task 6)、`WeatherController`(Task 7)、`AggregatedWeatherResponse` 类型定义都不需要改动,它们的现有逻辑正是为这个语义写的

**关于删除 `settleOrDefault`**:这个工具是 Task 2 为"逐子请求降级"引入的,只有 `QWeatherProvider` 用它。修正后 `QWeatherProvider` 需要知道"哪些子请求失败了"才能判断是否整体失败,而 `settleOrDefault` 的签名把失败原因丢掉了,所以它不再适用。留着会变成没人调用的死代码,一并删掉,同时删掉它的测试文件。

- [x] **Step 1: 先写会失败的新测试(和风天气:三个子请求全失败时应该 reject)**

在 `qweather.provider.spec.ts` 里追加一个用例。注意保留已有的两个用例——"正常聚合"和"单个子请求失败仍返回部分数据"都仍然是正确行为,不要删:

```typescript
  it('rejects when every sub-request fails, so the aggregator can mark the provider unavailable', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')))
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')))
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')));

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/401 invalid key/);
  });
```

- [x] **Step 2: 改写彩云天气的失败用例(从"降级返回空"改成"reject")**

`caiyun.provider.spec.ts` 里原来那个 `falls back to null/empty current and daily/hourly arrays when the combined request fails` 用例,断言的正是要被推翻的旧行为,直接整体替换成:

```typescript
  it('rejects when the combined request fails, so the aggregator can mark the provider unavailable', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => new Error('network timeout')));

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/network timeout/);
  });
```

其余用例(skycon 转文字 / 单位换算 / 经纬度顺序 / 湿度四舍五入回归)全部保留不动。

- [x] **Step 3: 运行两个 spec 确认新用例失败**

```bash
cd backend
npm test -- qweather.provider.spec.ts
npm test -- caiyun.provider.spec.ts
```

预期:两个新增/改写的用例都失败(当前实现不会 reject,`rejects.toThrow` 断言不满足);其余用例仍然通过。

- [x] **Step 4: 改 `QWeatherProvider.getForecast`**

用 `Promise.allSettled` 直接拿三个子请求的结果,这样既能返回部分数据,又能知道是不是全挂了:

```typescript
  async getForecast(query: WeatherQuery): Promise<NormalizedWeather> {
    const [current, hourly, daily] = await Promise.allSettled([
      this.fetchCurrent(query),
      this.fetchHourly(query),
      this.fetchDaily(query),
    ]);

    // 三个子请求全部失败,说明这家整体不可用(Key 失效、专属 API Host 配错、网络不通等),
    // 向上抛出让 WeatherService 标记成 status:'error',前端才能展示"该数据源暂时不可用";
    // 只要有任何一个成功,就正常返回,缺失的部分留 null/[]
    if (current.status === 'rejected' && hourly.status === 'rejected' && daily.status === 'rejected') {
      const reason = current.reason instanceof Error ? current.reason.message : String(current.reason);
      throw new Error(`和风天气请求全部失败: ${reason}`);
    }

    return {
      provider: this.name,
      updatedAt: new Date().toISOString(),
      current: current.status === 'fulfilled' ? current.value : null,
      hourly: hourly.status === 'fulfilled' ? hourly.value : [],
      daily: daily.status === 'fulfilled' ? daily.value : [],
    };
  }
```

同时删掉文件顶部对 `settleOrDefault` 的 import。

- [x] **Step 5: 改 `CaiyunProvider.getForecast`**

彩云天气是单个组合接口,失败就是整体失败,所以直接去掉 `try`/`catch`,让错误自然向上传播。方法体保留原来 `try` 块里的内容(请求 + 归一化),把 `try {` / `} catch { return {...} }` 这层包裹删掉即可,其余一行都不用改。

- [x] **Step 6: 删除不再使用的 `settleOrDefault` 及其测试**

```bash
cd /home/huangyingming/test-code/weather-app/.claude/worktrees/weather-mvp
git rm backend/src/weather/providers/settle-or-default.util.ts backend/src/weather/providers/settle-or-default.util.spec.ts
```

删除后确认没有任何文件还在 import 它:

```bash
grep -rn "settle-or-default\|settleOrDefault" backend/src || echo "no references left"
```

预期:输出 `no references left`。

- [x] **Step 7: 运行全量测试确认通过**

```bash
cd backend
npm test
```

预期:全部 PASS。相比修正前,测试总数会少 2 个(删掉的 `settleOrDefault` 用例),多 1 个(和风天气全失败用例),彩云天气那个用例是改写不是新增。

- [x] **Step 8: 端到端确认 `status:'error'` 现在真的会出现**

在没有真实凭据的当前环境下,这正好是"两家都不可用"的场景,可以直接验证:

```bash
cd backend
cp -n .env.example .env 2>/dev/null || true
npm run build && node dist/main.js &
sleep 3
curl -s "http://localhost:3000/weather?lat=39.92&lon=116.41"
```

预期:HTTP 200,`results` 数组两条记录的 `status` 都是 `"error"`,各带一条 `message`(而不是修正前的 `status:"ok"` + 全空数据)。确认后记得停掉后台进程,并且不要提交 `.env` 和 `dist/`。

- [x] **Step 9: 提交**

```bash
cd /home/huangyingming/test-code/weather-app/.claude/worktrees/weather-mvp
git add backend/src/weather/providers
git commit -m "$(cat <<'EOF'
Make provider failure observable instead of silently degrading

Both adapters swallowed every error into an empty-but-successful
forecast, so WeatherService's allSettled never saw a rejection and
ProviderResult's status:'error' branch was unreachable — the frontend
could not tell a dead data source from one with no data. QWeather now
rejects only when all three sub-requests fail (partial data still
resolves), Caiyun propagates its combined-endpoint failure, and the
now-unused settleOrDefault helper is removed.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: 全部失败的聚合结果只做短时缓存

> **为什么有这个任务**:Task 8 落地缓存后,实现者主动指出一个计划没考虑到的问题——缓存不区分成功和失败,于是"两家数据源都失败"的结果也会被缓存满 TTL(默认 30 分钟)。后果是一次短暂的网络抖动会让这个坐标上的所有用户在半小时内持续看到"数据源不可用",即使第三方服务早就恢复了。人工裁定:成功结果维持长 TTL,全部失败的结果只缓存 60 秒——既让服务恢复后能很快自愈,又避免数据源故障期间每个请求都去无谓地重试、把免费额度刷穿。

**Files:**
- Modify: `backend/src/config/configuration.ts`
- Modify: `backend/src/config/configuration.spec.ts`
- Modify: `backend/.env.example`
- Modify: `backend/src/weather/weather.service.ts`
- Modify: `backend/src/weather/weather.service.spec.ts`

**Interfaces:**
- Consumes:`ConfigService.get('cache.ttlSeconds')`(已有)、新增 `ConfigService.get('cache.failureTtlSeconds')`
- Produces:`WeatherService.getAggregatedForecast` 的对外签名和返回结构完全不变;只有缓存写入时长的行为发生变化——所有 provider 都是 `status:'error'` 时用短 TTL,否则用原有 TTL。`WeatherController`、`ProvidersModule`、各 Provider 均不需要改动

- [x] **Step 1: 扩展配置(先改测试)**

`configuration.spec.ts` 现有那个用例断言的是完整的配置对象结构,新增字段会让它失败,所以直接把 `cache` 那一项的期望值改掉,并在 `beforeEach` 设置的环境变量里加上新变量:

```typescript
      WEATHER_CACHE_TTL_SECONDS: '900',
      WEATHER_CACHE_FAILURE_TTL_SECONDS: '30',
```

```typescript
      cache: { ttlSeconds: 900, failureTtlSeconds: 30 },
```

- [x] **Step 2: 运行测试确认失败**

```bash
cd backend
npm test -- configuration.spec.ts
```

预期:FAIL,实际返回的 `cache` 对象里没有 `failureTtlSeconds`。

- [x] **Step 3: 实现配置项**

`configuration.ts` 里把 `cache` 一项改成:

```typescript
  cache: {
    ttlSeconds: parseInt(process.env.WEATHER_CACHE_TTL_SECONDS ?? '1800', 10),
    // 全部数据源都失败时用的短 TTL:够挡住瞬间的重复请求,又能让服务恢复后很快自愈
    failureTtlSeconds: parseInt(process.env.WEATHER_CACHE_FAILURE_TTL_SECONDS ?? '60', 10),
  },
```

`.env.example` 在 `WEATHER_CACHE_TTL_SECONDS=1800` 下面加一行:

```
WEATHER_CACHE_FAILURE_TTL_SECONDS=60
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- configuration.spec.ts
```

预期:PASS

- [x] **Step 5: 给 `weather.service.spec.ts` 加失败短缓存的用例(先失败)**

现有的 `fakeConfigService()` 辅助函数返回的是 `{ get: () => 1800 }`,对任何 key 都返回同一个值,新用例需要区分两个 key,所以把它替换成按 key 返回的版本,并在文件末尾追加新用例。替换 `fakeConfigService`:

```typescript
function fakeConfigService() {
  return {
    get: (key: string) => (key === 'cache.failureTtlSeconds' ? 60 : 1800),
  } as unknown as ConfigService;
}
```

追加用例(注意 `cache.set` 的第三个参数是毫秒):

```typescript
  it('caches an all-error aggregate with the short failure TTL so a transient outage is not sticky', async () => {
    const failing: WeatherProvider = {
      name: 'qweather',
      getForecast: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const cache = fakeCache();

    const service = new WeatherService([failing], cache, fakeConfigService());
    await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(cache.set).toHaveBeenCalledWith('weather:39.92:116.41', expect.anything(), 60 * 1000);
  });

  it('caches an aggregate containing any successful provider with the normal TTL', async () => {
    const ok: WeatherProvider = { name: 'qweather', getForecast: vi.fn().mockResolvedValue(fakeWeather('qweather')) };
    const failing: WeatherProvider = {
      name: 'caiyun',
      getForecast: vi.fn().mockRejectedValue(new Error('timeout')),
    };
    const cache = fakeCache();

    const service = new WeatherService([ok, failing], cache, fakeConfigService());
    await service.getAggregatedForecast({ lat: 39.92, lon: 116.41 });

    expect(cache.set).toHaveBeenCalledWith('weather:39.92:116.41', expect.anything(), 1800 * 1000);
  });
```

- [x] **Step 6: 运行测试确认新用例失败**

```bash
npm test -- weather.service.spec.ts
```

预期:"short failure TTL" 那个用例失败(当前实现对失败结果也用 1800 秒);另一个"normal TTL"用例此时应该已经通过(它断言的是现有行为),这是正常的。

- [x] **Step 7: 实现按结果选择 TTL**

`weather.service.ts` 里,把原来固定取 `cache.ttlSeconds` 的两行:

```typescript
    const ttlSeconds = this.configService.get<number>('cache.ttlSeconds') ?? 1800;
    await this.cache.set(cacheKey, response, ttlSeconds * 1000);
```

替换成:

```typescript
    await this.cache.set(cacheKey, response, this.resolveTtlSeconds(results) * 1000);
```

并在 `buildCacheKey` 旁边新增:

```typescript
  // 所有数据源都失败时只短时缓存:避免故障期间每个请求都去重试刷穿免费额度,
  // 同时保证第三方恢复后用户不用再等一个完整 TTL 才能看到数据
  private resolveTtlSeconds(results: ProviderResult[]): number {
    const everyProviderFailed = results.every((result) => result.status === 'error');
    if (everyProviderFailed) {
      return this.configService.get<number>('cache.failureTtlSeconds') ?? 60;
    }
    return this.configService.get<number>('cache.ttlSeconds') ?? 1800;
  }
```

- [x] **Step 8: 运行全量测试确认通过**

```bash
npm test
```

预期:全部 PASS。

- [x] **Step 9: 提交**

```bash
cd /home/huangyingming/test-code/weather-app/.claude/worktrees/weather-mvp
git add backend/src/config backend/.env.example backend/src/weather/weather.service.ts backend/src/weather/weather.service.spec.ts
git commit -m "$(cat <<'EOF'
Cache all-error aggregates briefly instead of for the full TTL

An aggregate where every provider failed was cached as long as a
successful one, so a momentary outage kept serving "unavailable" for
half an hour after the upstream recovered. All-error responses now use
a separate short TTL (60s by default) — still enough to absorb a burst
of requests without hammering the providers' free quotas.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
