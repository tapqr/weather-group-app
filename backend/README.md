# 天气对比后端

用 NestJS 实现的天气聚合服务:并行请求和风天气(QWeather)、彩云天气(Caiyun)两家的数据,归一化成统一格式返回,单一数据源失败不影响另一家展示。前端把两家结果并排展示,让用户自己判断哪家更准。

## API

### `GET /weather?lat=<纬度>&lon=<经度>`

`lat`/`lon` 是 query string 参数(字符串会被自动转成数字),用 `class-validator` 的 `IsLatitude`/`IsLongitude` 校验;非法或缺失参数返回 `400`。

**响应结构**(`200`):

```json
{
  "results": [
    { "provider": "caiyun", "status": "ok", "data": { "...": "见下方" } },
    { "provider": "qweather", "status": "error", "message": "数据源暂时不可用" }
  ]
}
```

`results` 的**顺序是稳定的**:彩云天气在前、和风天气在后,由 `providers.module.ts` 里
`WEATHER_PROVIDERS` 的注册顺序决定(有 `providers.module.spec.ts` 锁定)。前端顶部对比区
和卡片的先后直接跟随这个顺序 —— 调整它会改变界面上两家的左右位置。

`results` 里每个数据源一条记录,`status` 只有两种取值:

- `status: "ok"`:附带 `data`,结构是:
  ```ts
  {
    provider: "qweather" | "caiyun";
    updatedAt: string; // ISO 时间戳
    current: { tempC, feelsLikeC, conditionText, humidityPercent, windSpeedKph } | null;
    hourly: Array<{ time, tempC, conditionText, precipitationProbabilityPercent }>;
    daily: Array<{ date, tempMinC, tempMaxC, conditionText, precipitationProbabilityPercent }>;
  }
  ```
  `daily[].date` 统一归一化为 `YYYY-MM-DD`(两家原始格式不同,已在后端统一处理)。`windSpeedKph` 两家单位都是 km/h,可以直接并排比较。
  `current`/`hourly`/`daily` 里的字段允许是 `null`(某些字段该数据源确实没有权限返回),但**不代表这个数据源不可用**——只要拿到了任意一部分数据就是 `status: "ok"`。
- `status: "error"`:附带 `message`(面向用户的稳定文案,如"数据源暂时不可用"),表示这家数据源**整体**请求失败(Key 过期、网络不通、限流等)。前端应该展示一张灰色的"该数据源暂时不可用"卡片,而不是报错崩溃;上游的真实失败原因只记在后端日志里,不会透传给浏览器。

### `GET /geo/reverse?lat=<纬度>&lon=<经度>`

坐标反查地名。响应 `200`:

```json
{ "location": { "id": "101011600", "name": "东城", "adm1": "北京市", "adm2": "北京", "lat": 39.91755, "lon": 116.41876 } }
```

查不到或上游失败时 `location` 为 `null`,**仍返回 `200`** —— 地名是锦上添花,不该为它让前端进错误分支。

### `GET /geo/search?q=<关键词>`

按关键词搜索城市,支持中文与拼音,返回最多 10 条。响应 `200`:`{ "locations": [ ... ] }`。

`q` 为空返回 `400`。**上游失败返回 `5xx`** —— 这是用户主动发起的操作,必须有反馈。

### `GET /geo/top`

热门城市(中国,最多 20 条),供搜索框空状态使用。上游失败时返回 `200` + 空数组。

三个路由复用 `QWEATHER_API_HOST` / `QWEATHER_API_KEY`,走独立的限流额度(`GEO_THROTTLE_LIMIT`),缓存 TTL 由 `GEO_CACHE_TTL_SECONDS` 控制。**失败结果一律不缓存**,避免 24 小时的 TTL 把一次瞬时故障固化一整天。

## 环境变量

复制 `.env.example` 为 `.env` 并填入真实值。**`.env` 不要提交到 git。**

| 变量 | 作用 | 默认值 | 是否必需 |
|---|---|---|---|
| `PORT` | 服务监听端口 | `3000` | 否 |
| `CORS_ORIGIN` | 允许跨域访问的前端源(生产环境**必须**改成前端实际部署域名) | `http://localhost:5173` | 否(但生产环境务必显式设置) |
| `WEATHER_CACHE_TTL_SECONDS` | 成功聚合结果的缓存 TTL(秒) | `1800` | 否 |
| `WEATHER_CACHE_FAILURE_TTL_SECONDS` | 全部数据源都失败时的缓存 TTL(秒,故意设得比正常 TTL 短,避免故障期间每个请求都去重试刷穿免费额度,又能在第三方恢复后很快自愈) | `60` | 否 |
| `QWEATHER_API_HOST` | 和风天气**专属** API Host(不是文档里的公共域名,见下文) | 空 | **是**(启动时会校验,缺失直接拒绝启动) |
| `QWEATHER_API_KEY` | 和风天气 API Key | 空 | **是**(同上) |
| `CAIYUN_TOKEN` | 彩云天气 Token | 空 | **是**(同上) |
| `THROTTLE_TTL_MS` | 限流统计窗口(毫秒) | `60000` | 否 |
| `THROTTLE_LIMIT` | 每个窗口内每个来源 IP 允许的请求数 | `30` | 否 |
| `GEO_CACHE_TTL_SECONDS` | 地理接口缓存 TTL(秒)。地理数据几乎不变,开得比天气长得多 | `86400` | 否 |
| `GEO_THROTTLE_TTL_MS` | 地理接口限流统计窗口(毫秒) | `60000` | 否 |
| `GEO_THROTTLE_LIMIT` | 地理接口每窗口每 IP 的请求数。**与 `/weather` 的额度相互独立**,且是 `/geo/reverse`、`/geo/search`、`/geo/top` **各自**的额度(`@nestjs/throttler` 按 handler 生成限流 key)—— 三个路由合计是这个值的 3 倍 | `20` | 否 |

`QWEATHER_API_HOST`/`QWEATHER_API_KEY`/`CAIYUN_TOKEN` 三项缺失任意一项,应用启动时会直接抛错退出(不会带着空凭据"看起来很健康"地跑起来)。

## 申请凭据

- **和风天气**:去 [console.qweather.com](https://console.qweather.com) 注册开发者账号,创建项目并选择免费订阅,拿到的是**控制台里显示的专属 API Host**(形如 `xxxxxxxx.re.qweatherapi.com`),不是官方文档示例里那个公共域名——用错了会请求失败。
- **彩云天气**:去 [platform.caiyunapp.com/regist](https://platform.caiyunapp.com/regist) 注册开放平台账号,获取免费 Token。

## 缓存与限流

- **缓存**:内存缓存(带 LRU 容量上限,防止无界增长),key 是请求坐标四舍五入到小数点后 2 位(约 1.1km 精度)。命中缓存直接返回,不再请求第三方。聚合结果里只要有任意一家成功就按 `WEATHER_CACHE_TTL_SECONDS` 缓存;两家全部失败则只按 `WEATHER_CACHE_FAILURE_TTL_SECONDS` 短时缓存。
- **限流**:基于来源 IP,每 `THROTTLE_TTL_MS` 毫秒内最多 `THROTTLE_LIMIT` 次请求,超出返回 `429`。

`/geo/*` 三个路由的规则与 `/weather` **相反**,不要类比:

- **缓存**:失败一律不缓存(见上文"三个路由的失败行为刻意不对称"),避免一次瞬时抖动被 `GEO_CACHE_TTL_SECONDS`(24 小时)固化一整天;空结果(查无此地)是有效结果,照常缓存。
- **限流**:与 `/weather` 共用的 `default` 限流器互相跳过,走独立的 `geo` 限流器,额度由 `GEO_THROTTLE_LIMIT` 控制。但这个额度是**每个路由各自的**(`@nestjs/throttler` 的限流 key 按 handler 生成),`/geo/reverse`、`/geo/search`、`/geo/top` 三者合计是配置值的 3 倍——评估上游免费额度是否够用时要按合计值算,而不是配置值本身。

## 本地开发

```bash
npm install
cp .env.example .env   # 然后填入真实凭据
npm run start:dev
```

## 测试

```bash
npm test            # 单元测试 + 端到端契约测试(Vitest,不是 Jest)
npm run test:cov    # 带覆盖率
```

## 生产部署

```bash
npm run build
npm run start:prod
```

部署注意事项:

- 反向代理(nginx/CDN)后面运行时,应用已经设置了 Express 的 `trust proxy`,限流会按真实客户端 IP(`X-Forwarded-For`)分别计数;如果部署方式变化(比如换成不经过反向代理直接暴露),需要重新评估这个设置是否还合适。
- `CORS_ORIGIN` 必须配置成前端的实际部署域名,不能沿用本地开发默认值。
- 三个凭据环境变量缺失会导致启动失败,部署流水线里要确保它们已经注入。
