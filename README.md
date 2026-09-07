# 天气对比

把**和风天气**和**彩云天气**的预报并排展示,让用户自己判断哪家更准。

单一天气服务商总是时准时不准 —— 有时 A 家准,有时反过来。这个应用不替用户选,而是把两家的实况、逐时、逐日预报摆在一起,差异一眼可见。

## 环境要求

- **Node ≥ 22.14**。22.13.x 上 `nest start` 会抛 `ERR_REQUIRE_CYCLE_MODULE`(`@angular-devkit/schematics` 用 `require()` 加载纯 ESM 的 `ora`,22.13 的循环检测误判),22.14.0 已修复。与依赖树和包管理器无关。
- 和风天气、彩云天气的 API 凭据(免费版即可,申请入口见 [`backend/README.md`](backend/README.md))。

## 快速开始

后端和前端是**两个独立的部署单元**,不共享 npm 包,各自安装依赖。

### 后端(端口 3000)

```bash
cd backend
npm install
cp .env.example .env    # 填入 QWEATHER_API_HOST / QWEATHER_API_KEY / CAIYUN_TOKEN
npm run start:dev
```

三个凭据缺任意一个会**启动即失败**,不会带着空凭据跑起来。

### 前端(端口 5173)

```bash
cd frontend
npm install
cp .env.example .env    # 默认指向 http://localhost:3000,通常不用改
npm run dev
```

这是个移动端 H5 页面,用手机访问局域网地址体验最准。

## 常用命令

| 目录 | 命令 | 说明 |
|---|---|---|
| `backend/` | `npm test` | 单元测试 + HTTP 契约测试(Vitest,不是 Jest) |
| `backend/` | `npm run lint` | oxlint(不是 ESLint) |
| `backend/` | `npm run build && npm run start:prod` | 生产构建与启动 |
| `frontend/` | `npm test` | Vitest + jsdom + Vue Test Utils |
| `frontend/` | `npm run build` | `vue-tsc` 类型检查 + 构建,类型错误会阻断构建 |

## API

| 路由 | 用途 |
|---|---|
| `GET /weather?lat=&lon=` | 多数据源聚合预报,每家一条记录 |
| `GET /geo/reverse?lat=&lon=` | 坐标反查地名 |
| `GET /geo/search?q=` | 城市搜索(支持中文与拼音) |
| `GET /geo/top` | 热门城市 |

完整的响应结构、环境变量表、缓存与限流策略见 [`backend/README.md`](backend/README.md)。

## 部署

生产环境用 nginx + PM2 部署在子路径下(页面 `/weather-app/`,接口 `/weather-app/api/`),
完整步骤、配置示例与故障对照见 [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)。

有两件事在那里反复强调,这里也提一句:前端的站点前缀是**构建时**写死的,改了必须重新构建;
后端**不能开 cluster 或多实例** —— 限流和缓存都是进程内状态,多进程会让限流额度翻倍、
缓存命中率骤降,进而刷穿上游免费额度。

## 两个设计要点

**降级是产品核心,不是异常处理。** 单个数据源失败不影响另一家展示 —— 前端会把失败的那家渲染成灰色卡片,而不是整页报错。区分两层语义:数据源整体失败(`status: 'error'`)与个别字段缺失(`status` 仍是 `'ok'`,字段为 `null`)。

**归一化后的契约是唯一对外形态。** 两家原始数据差异很大(单位、日期格式、预报天数都不同),全部在各自的 Provider 内部抹平。单位统一为 °C / % / km/h,日期统一为 `YYYY-MM-DD`。但**两家的逐日天数不同**(和风 7 天、彩云 3 天,免费版差异),前端不假设各列行数相等。

## 项目结构

```
backend/     NestJS 聚合服务(ESM,相对导入必须带 .js 扩展名)
frontend/    Vite + Vue3 + TypeScript + Pinia,移动端 H5
docs/        设计规格与实现计划
CLAUDE.md    给 AI 编码助手的项目指引
```

新增数据源只需三步:在 `backend/src/weather/providers/` 加一个实现 `WeatherProvider` 接口的类、注册进 `providers.module.ts`、在前端 `ProviderCard.vue` 的标签映射里加一行中文名。聚合逻辑本身不用改。
