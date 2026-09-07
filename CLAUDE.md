# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 这个仓库是什么

多数据源天气对比应用。核心命题:单一天气服务商时准时不准,所以把**和风天气**和**彩云天气**的预报并排展示,让用户自己判断。

`backend/`(NestJS)和 `frontend/`(Vite + Vue3)是**两个独立部署单元**,不共享 npm 包、没有 workspace 配置,各自 `npm install`。

## 常用命令

后端(`cd backend`):

```bash
npm run start:dev              # 开发(watch)
npm test                       # 单元测试 + HTTP 契约测试(Vitest,不是 Jest)
npx vitest run src/weather/weather.service.spec.ts   # 跑单个测试文件
npm run test:cov               # 覆盖率
npm run lint                   # oxlint(不是 ESLint)
npm run build && npm run start:prod
```

前端(`cd frontend`):

```bash
npm run dev                    # dev server,默认 5173
npm test                       # Vitest + jsdom + @vue/test-utils
npm test -- src/stores/weather.spec.ts   # 跑单个测试文件
npm run build                  # vue-tsc 类型检查 + vite build,类型错误会阻断构建
```

后端跑起来前需要 `cp .env.example .env` 并填入真实凭据,缺任意一个凭据会**启动即失败**(见 `backend/README.md`,里面有完整的环境变量表和凭据申请入口)。

## 架构

### 降级是产品核心,有两层语义,别搞混

> 术语表在 [`CONTEXT.md`](CONTEXT.md)。那里把"降级"拆成了**数据源失败** / **字段缺失** / **模拟回落**三个词,并且定义了分歧判定的三个层级(**共识** / **分歧** / **一致性**)—— 这几个词混用过,讨论时请用 CONTEXT.md 里的说法。

`GET /weather?lat=&lon=` 返回 `{ results: ProviderResult[] }`,每个数据源一条:

- **数据源级失败** → `status: 'error'` + `message`。`message` 是**固定的中文用户文案**(`'数据源暂时不可用'`),不是上游异常文本 —— 彩云的 token 拼在 URL 里,原始异常会泄露凭据。前端直接展示这个字符串,不要解析它、不要再包一层同义句。
- **字段级缺失** → `status` 仍是 `'ok'`,只是某些字段为 `null`/`[]`。**只要拿到任意一部分数据就算成功。**

这个区分在三个地方各实现了一遍,改动时要一起看:`WeatherService.getAggregatedForecast`(跨数据源的 `Promise.allSettled`)、各 Provider 内部(`QWeatherProvider` 对 current/hourly/daily/**airquality** 四个子请求再做一次 `allSettled`)、前端 `ProviderCard.vue`。

⚠️ 和风的四个子请求里,判"整家不可用"时**只看前三个**(current/hourly/daily),空气质量刻意不算进去:只有 AQI 成功、温度和天气全挂的卡片对用户没有意义,那种情况仍应判为数据源失败;反过来 AQI 单独挂掉只是少一栏指标,属于字段缺失。加新子请求时要想清楚它属于哪一类。

⚠️ **已知可观测性缺口**:Provider 内部的部分子请求失败会被静默吞掉 —— 只留 `[]`/`null`,不打日志。实际撞到过和风 `daily` 返回 0 天而 `current`/`hourly` 正常、日志毫无痕迹的情况。生产上意味着"用户少看到 7 天预报、监控无感知"。

### 归一化在各 Provider 内部完成

`NormalizedWeather` 是唯一对外契约(`backend/src/weather/interfaces/weather.interfaces.ts`)。单位统一为 °C / % / **km/h**,`daily[].date` 统一为 `YYYY-MM-DD`。两家原始数据差异很大,都在各自 Provider 里抹平:

- 彩云的 `metric:v2` 单位制返回的**已经是 km/h**(只有 `SI` 才是 m/s),曾因为多乘一次 3.6 导致风速虚高 3.6 倍 —— 这类换算改动务必用真实 API 核对
- **气压两家差 100 倍**:彩云给帕(实测 `100497.58`),和风给百帕(实测 `1011.66`)。契约统一为 hPa
- **能见度两家差 1000 倍**:彩云给公里(实测 `20.1`),和风给米(实测 `21850`)。契约统一为 km
- 和风的数值都是 `{ value, unit }` 结构,所以换算**按 unit 字段判断**、遇到不认识的单位报 `null`;彩云是**裸数字、响应里没有任何单位信息**,只能按量级推断(见 `caiyun.provider.ts` 里 `caiyunPressureToHpa` / `caiyunVisibilityToKm` 的注释)。这两条是上面那个"虚高 3.6 倍"的同类,改动前务必用真实 API 核对
- **风力等级的来源不同**:和风的 `wind.scale` 是上游直接给的,彩云**不提供**这个字段,是在 Provider 里按蒲福风级标准表从 km/h 反算的(`providers/beaufort.ts`)。两家风速接近时等级仍可能差一级,那是换算边界,不是数据源分歧
- **空气质量的成本不对称**:彩云的 AQI 就在已有那次综合请求的 `realtime.air_quality` 里(取国标 `aqi.chn`),零额外额度;和风必须单独调 `/airquality/v1/current/{lat}/{lon}`(取 `indexes[]` 里 `code === 'cn-mee'` 那条),这是和风的第四个子请求。v7 的 `/v7/air/now` 已被上游停用(实测 403 Deprecated)
- **逐日的 `conditionText` 是白天段**,与 `nightConditionText` 配成一对:和风取 `daytime`/`nighttime`,彩云取 `skycon_08h_20h`/`skycon_20h_32h`(后者是 20:00 至次日 08:00)。昼夜真的会不同 —— 2026-09-07 实测北京彩云"多云/小雨"、和风"小雨/中雨"。夜间段拿不到时为 `null`,**不要拿白天的值冒充**,那会造出"昼夜相同"的假象
- 两家 `daily[].date` 原始都是 `2026-09-02T00:00+08:00`(和风在 `forecastStartTime`),截成 `YYYY-MM-DD`
- 和风走 **v1 接口**(`/weather/v1/{current,hourly,daily}/{lat}/{lon}`,v7 已标记弃用)。v1 与 v7 有四处不兼容,改这个 Provider 前先看 `qweather.provider.ts` 里的注释:坐标在路径里且**顺序是 lat/lon**(v7 是 `lon,lat`)、湿度和降水概率是 **0~1 小数**、风速是 **m/s**(v7 是 km/h)、时间戳默认 **UTC**,必须传 `localTime=true`。注意 v1 **没有 `unit` 查询参数**(那是 v7 才有的),单位固定公制,换算只能在 Provider 里做
- 两家 `daily` 长度不同(和风 7 天、彩云 3 天,免费版差异),**前端不能假设各列行数相等**
- ⚠️ **两家的 `hourly` 起始时刻也不一样**。2026-09-07 实测同一次请求里彩云从 15:00 起、和风从 16:00 起。跨数据源对比**必须按时间戳对齐,绝不能按数组下标** —— 按下标配对会把彩云 15:00 和和风 16:00 当成同一时刻,整条曲线系统性错位一小时,而且画出来完全看不出异常。对齐逻辑在 `frontend/src/utils/consensus.ts` 的 `alignHourly`
- 彩云免费版**不返回 `minutely`**(分钟级降水)。实测响应里只有 `daily/hourly/realtime/primary/forecast_keypoint`,没有 `minutely` 这个 section —— 任何依赖它的功能都做不了

新增数据源:在 `providers/` 加一个实现 `WeatherProvider` 接口的类,注册进 `providers.module.ts` 的 `WEATHER_PROVIDERS` 工厂数组,再到前端 `App.vue` / `ProviderCard.vue` 的 `PROVIDER_LABELS` 各加一行中文名,最后在 `frontend/src/style.css` 的三个 `[data-daypart]` 块里各加一个 `--series-<名字>` 曲线配色(不加也能跑,会落到 `--series-fallback` 的灰色)。`WeatherService` 本身不用改。

跨数据源的判定逻辑(`utils/consensus.ts`)一律用**极差**而不是"两家之差",所以新增数据源后分歧判定会自动把它算进去,不需要改。

### geo 模块:同样的降级思路,但规则相反

`backend/src/geo/`(`/geo/reverse`、`/geo/search`、`/geo/top`)提供坐标反查地名 + 城市搜索,复用和风的 Key,但缓存/限流/失败语义都**刻意**和 weather 模块不对称,别照搬:

- 三个路由的失败行为互不相同:`reverse`/`top` 失败静默返回 `null`/`[]`(锦上添花,不该让用户看到报错);`search` 失败要向上抛(用户主动发起的操作必须有反馈)。
- 缓存:失败**一律不缓存**(TTL 长达 24 小时,缓存住一次瞬时抖动会固化一整天);空结果(查无此地)是有效结果,照常缓存。
- 限流:与 `/weather` 走独立的 `geo` 限流器,但 `GEO_THROTTLE_LIMIT` 是**每个路由各自的额度**(`@nestjs/throttler` 的限流 key 按 handler 生成)——三个路由合计是配置值的 3 倍,评估上游免费额度要按合计值算。详见 `backend/README.md`「缓存与限流」。

### 前端分成"跨数据源区块"和"按数据源卡片"两层

页面自上而下:城市标题 → `headline`(各家实况大温度并列)→ `ConsensusCard`(分歧摘要)→ `HourlyTrendChart`(逐时曲线)→ 每家一张 `ProviderCard`。

前两个新区块是**跨数据源**的,数据来自 `utils/consensus.ts`:

- `alignHourly` / `alignDaily` —— 按时间戳和日期对齐各家预报(**不是按数组下标**,见上面归一化那节的警告),缺失处留 `null` 让曲线断开而不是补值
- `buildConsensus` —— 生成三档共识判定。不足两家有实况时返回 `null`,`ConsensusCard` 整个不渲染("一家数据谈不上共识")

`ProviderCard` 只渲染它自己那家的数据,唯一的例外是逐日行上的一致性标记 —— 那是跨数据源属性,由 `App.vue` 算好通过 `agreements` prop 传进去。

曲线的纯几何计算在 `utils/chart.ts`(断线、指针位置换算、默认读数时刻),刻意与组件分离:jsdom 不做布局(`getBoundingClientRect()` 恒返回 0、`PointerEvent.clientX` 只读),隔着 DOM 测不了坐标,抽成纯函数才能直接对数字断言。为什么不引图表库见 [`docs/adr/0001-hand-rolled-svg-charts.md`](docs/adr/0001-hand-rolled-svg-charts.md)。

天气图标(`WeatherIcon.vue`)复用现有的 `classifyCondition()` 分类,**不做"上游天气码 → 图标"的映射表** —— 那需要维护两张表(和风 `condition.code`、彩云 `skycon`),而分类器本来就是为图标预留的。晴天画太阳还是月亮由 `resolveDayPart()` 按本地时钟决定,因为彩云的 `CLEAR_DAY`/`CLEAR_NIGHT` 在后端归一化时已被压成「晴」,昼夜信息那一步就丢了。

### 前后端类型靠手动同步

`frontend/src/types/weather.ts` 是 `backend/src/weather/interfaces/weather.interfaces.ts` 的手抄副本(两个独立项目,不共享包)。**改后端契约必须同步改前端类型**,没有任何自动检查会提醒你。后端那份多出 `WeatherQuery`/`WeatherProvider` 两个服务端内部接口,是正常的。

同样地,`frontend/src/types/location.ts` 是 `backend/src/geo/interfaces/geo.interfaces.ts`(`NormalizedLocation`)的手抄副本,改 geo 接口字段时要一起改。

### 缓存与限流

缓存 key 是坐标四舍五入到小数点后 2 位(约 1.1km),抵消 GPS 抖动。TTL 分两档:有任意一家成功用 `WEATHER_CACHE_TTL_SECONDS`(默认 1800),**全部失败**只缓存 `WEATHER_CACHE_FAILURE_TTL_SECONDS`(默认 60)—— 既挡住故障期间刷穿免费额度,又能在上游恢复后快速自愈。内存缓存带 LRU 上限(`CACHE_MAX_ENTRIES`),否则堆内存会随"见过的坐标数"无界增长。

`main.ts` 里设了 `trust proxy`,因为线上在 nginx/CDN 后面,不设置的话按 IP 限流会退化成全站共享一个额度。部署方式变化时要重新评估。

## 容易踩的坑

- **Node 必须 ≥ 22.14。** 22.13.x 上 `nest start` 会抛 `ERR_REQUIRE_CYCLE_MODULE`(`@angular-devkit/schematics` 用 `require()` 加载纯 ESM 的 `ora`,22.13 的循环检测误判),22.14.0 已修复。与依赖树和包管理器都无关。
- **后端是 ESM**(`"type": "module"`),所有相对导入**必须带 `.js` 扩展名**,哪怕源文件是 `.ts` —— 例如 `import { AppModule } from './app.module.js'`。
- **两套 e2e 配置,靠文件名区分,极易搞错**:`npm test` 匹配 `**/*.spec.ts`,所以 `weather.e2e.spec.ts`(锁定 HTTP 契约的那个)**会**被 `npm test` 跑到;`npm run test:e2e` 用独立配置只匹配 `**/*.e2e-spec.ts`,当前仅脚手架遗留的 `test/app.e2e-spec.ts`。新写契约测试请沿用 `*.e2e.spec.ts`。
- **前端 `vitest.config.ts` 开了 `globals: true`,但 TypeScript 需要单独声明**:`tsconfig.app.json` 的 `types` 里有 `vitest/globals`,删掉它 `npm run build` 会在每个 spec 文件上报错。
- **前端 npm / bun 混用**:仓库里 `bun.lock` 和 `package-lock.json` 并存,当前依赖由 npm 管理。用 bun 重装会让 `node_modules` 属主和 ACL 变化,共享环境下的 claude-svc 可能失去写权限。
- `backend/package.json` 里有一段 `overrides`,是为绕开 `@nestjs/throttler` 尚未跟进 Nest 12 的 peer 依赖声明,注释里写了移除条件,别顺手删掉。

## 文档位置

- `CONTEXT.md` —— 术语表(ubiquitous language)。只放术语,不放实现细节
- `docs/adr/` —— 架构决策记录。目前只有一条:为什么曲线是手写 SVG 而不是图表库
- `backend/README.md` —— API 契约、环境变量表、凭据申请、缓存限流、部署注意事项(**改后端行为时同步更新它**)
- `docs/superpowers/specs/` 和 `docs/superpowers/plans/` —— 设计规格与实现计划,记录了当初为什么这么选
- `frontend/README.md` 目前还是 Vite 默认模板,没有实际内容

## Agent skills

### Issue tracker

Issue 和 spec 以 markdown 文件形式存放在 `.scratch/<feature>/` 下,不使用 GitHub Issues。See `docs/agents/issue-tracker.md`.

### Triage labels

使用五个标准角色名作为标签字符串,未做重命名。See `docs/agents/triage-labels.md`.

### Domain docs

单上下文布局:根目录一份 `CONTEXT.md` + `docs/adr/`。See `docs/agents/domain.md`.
