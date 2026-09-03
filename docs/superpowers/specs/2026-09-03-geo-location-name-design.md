# 用和风 GeoAPI 显示真实地名 Design

**目标:** 前端顶部当前显示硬编码的"当前位置",改为通过和风 GeoAPI 反查出的真实地名;
同时把城市搜索从前端 20 城静态列表换成 GeoAPI 实时搜索,并用热门城市填充搜索层的空状态。

**背景:** 定位成功后 `App.vue` 把 `'当前位置'` 作为 `cityName` 写死传给 store,用户无法确认
定位是否准确。搜索走 `src/data/cities.ts` 里手写的 20 个城市,既覆盖不足,也无法区分同名地点
(搜"朝阳"分不清是北京的还是辽宁的)。

## 事实核查(2026-09-03 实测,用户真实凭据)

和风 GeoAPI 的四个接口在**专属 API Host** 上全部可用,免费版无阻拦。注意公共域名
`geoapi.qweather.com` 返回 404 —— 必须用 `QWEATHER_API_HOST`,和天气接口同一个 host、同一个 key。

| 接口 | 路径 | 实测结果 | 本次是否使用 |
|---|---|---|---|
| 城市搜索 | `/geo/v2/city/lookup` | 关键词和坐标**都能传**,一个接口两用 | **是**,反查 + 搜索 |
| 热门城市 | `/geo/v2/city/top?range=cn&number=20` | 返回带完整行政区划的城市列表 | **是**,搜索层空状态 |
| POI 搜索 | `/geo/v2/poi/lookup` | 搜"西湖"→ 杭州西湖 / 惠州西湖 | 否 |
| POI 范围搜索 | `/geo/v2/poi/range` | 北京坐标附近 → 故宫博物院、中山公园 | 否 |

POI 两个接口不做:本产品的核心是**天气数据源对比**,加景点天气是往通用天气 App 跑,偏离主线。

实测返回样例:

```
坐标反查 116.4074,39.9042 → name="东城"  adm2="北京"  adm1="北京市"  id="101011600"
搜索「厦门」             → name="厦门"  adm2="厦门"  adm1="福建省"
搜索「海淀」             → name="海淀"  adm2="北京"  adm1="北京市"
搜索「朝阳」             → 朝阳(辽宁省)/ 朝阳(北京市)/ 朝阳(长春)/ 朝阳县 / 凌源
搜索「xiamen」           → 厦门(福建省)   ← 拼音同样可用
```

两个必须处理的细节:直辖市反查出来是**区级**("东城"而非"北京");地级市自身的
`name` 与 `adm2` **重复**("厦门"/"厦门"),无脑拼接会得到"厦门 厦门"。

## 模块边界

后端新增 `src/geo/`,与 `src/weather/` 平行 —— 它不是天气数据源,不应混入 `WeatherService`
的多源聚合逻辑。三个单元各一职责:

- **`QWeatherGeoProvider`** — 调和风 GeoAPI、归一化字段、提取上游错误原因
  (沿用 `CaiyunProvider` 那次加固里 `describeUpstreamError()` 的做法)
- **`GeoService`** — 缓存
- **`GeoController`** — 路由与参数校验

## 对外契约

```ts
interface NormalizedLocation {
  id: string;    // 和风 Location ID,如 "101011600"
  name: string;  // "东城"
  adm1: string;  // "北京市"(省级)
  adm2: string;  // "北京"(市级)
  lat: number;   // 和风返回字符串,这里转 number
  lon: number;
}
```

```
GET /geo/reverse?lat=&lon=  →  { location: NormalizedLocation | null }
GET /geo/search?q=          →  { locations: NormalizedLocation[] }   上游固定传 number=10
GET /geo/top                →  { locations: NormalizedLocation[] }   上游固定传 range=cn&number=20
```

`lat`/`lon` 沿用 `/weather` 已有的 `IsLatitude`/`IsLongitude` 校验方式。

`q` 的规则:trim 后非空即可,**不设最小长度** —— 单字搜索("北")是有效需求,和风自己会按
`rank` 排序返回最相关的结果,不需要前端替它设门槛。trim 后为空则返回 `400`。

### 三个路由的失败行为刻意不对称

| 路由 | 上游失败时 | 理由 |
|---|---|---|
| `/geo/reverse` | `200` + `location: null` | 用户没主动索取地名,不该为它弹错误。前端拿到 `null` 就回落到"当前位置" |
| `/geo/search` | `5xx` | 用户主动发起,必须有反馈,否则表现得像卡死 |
| `/geo/top` | `200` + `locations: []` | 空状态的锦上添花,退回"输入城市名开始搜索"即可 |

三条共同的底线:**GeoAPI 的任何失败都不得影响天气展示**,与后端既有的"单数据源失败不影响
另一家"是同一条原则。上游失败原因只进服务端日志,不透传给浏览器(和风的 key 在请求头里,
风险低于彩云的 URL token,但保持一致的做法)。

## 缓存与限流

地理数据几乎不变,与天气分开配置:

| 环境变量 | 默认值 | 说明 |
|---|---|---|
| `GEO_CACHE_TTL_SECONDS` | `86400` | 24 小时(天气是 1800) |
| `GEO_THROTTLE_TTL_MS` | `60000` | geo 路由独立的限流窗口 |
| `GEO_THROTTLE_LIMIT` | `60` | 独立额度,不与 `/weather` 的 30 次抢同一份 |

缓存 key:

```
geo:rev:{lat.toFixed(2)}:{lon.toFixed(2)}   坐标取两位小数(约 1.1km),复用天气侧验证过的做法
geo:q:{关键词 trim + 转小写}                转小写是为了让拼音搜索命中同一份缓存
geo:top
```

**只缓存成功结果,失败一律不写缓存。** 这与天气侧不同:天气用一个短的
`WEATHER_CACHE_FAILURE_TTL_SECONDS`(60 秒)挡住故障期间的重复重试,但 geo 的 TTL 是 24 小时,
一旦把失败结果写进去,一次瞬时抖动会被固化一整天。geo 的调用量远低于天气,不缓存失败带来的
重试压力可以接受。

"查无此地"与上游失败区别对待:前者是有效结果,按空结果缓存(`/geo/reverse` 缓存 `null`、
`/geo/search` 缓存 `[]`),避免同一个无效关键词
反复打上游。（2026-09-03 实测确认:和风新版 Error Code v2 对"查无此地"返回的是 HTTP 400 +
`error.type` 含 `no-such-location`,不是本文档最初假设的 200 + `code: "404"` —— 后者从未在
真实请求里出现过,axios 遇 4xx 会直接抛错,实现按 HTTP 状态判断过一次才发现这个假设是错的。）

限流独立配置的原因:搜索比查天气频繁得多,共用 30 次/分钟 的话,用户认真搜几次城市再刷新天气
就会撞 429,而且这个失败**看起来像天气服务挂了**,会把排查方向带偏。

用 `@Throttle()` 装饰器在 `GeoController` 上覆盖全局配置。

## 显示规则

`formatLocationName()` 作为纯函数放前端 `src/utils/location-display.ts`,与
`weather-display.ts` 并列:

```
name === adm2  →  name                厦门 → "厦门"
name !== adm2  →  `${adm2}·${name}`    东城 → "北京·东城"
```

顶部标题与搜索结果列表**共用同一个函数**,保证两处显示一致。放在前端而非后端,因为这是展示
逻辑,后端契约应保持原始字段不做拼接。

## 关键时序:地名不能拖慢天气

`onMounted` 拿到坐标后**并行**发起两个请求:

```
定位成功
  ├── store.loadWeather(lat, lon)     天气先到就先渲染
  └── fetchReverseLocation(lat, lon)  地名后到再更新标题
```

反查慢或失败都不阻塞天气展示。标题在地名到达前显示"当前位置",到达后替换。

## 前端改动

| 文件 | 动作 |
|---|---|
| `src/api/geo.ts` | 新增,三个函数 |
| `src/types/location.ts` | 新增,与后端契约手动保持同步(两个项目不共享 npm 包) |
| `src/utils/location-display.ts` | 新增,TDD |
| `src/stores/weather.ts` | `cityName` 来源改为反查结果 |
| `src/App.vue` | 并行请求 + 标题渲染 |
| `src/components/CitySearch.vue` | 静态过滤 → 异步搜索 |
| `src/data/cities.ts` 及其测试 | **删除** |

`CitySearch` 的异步化要处理四件事:

1. **防抖 300ms** —— 输入停止后才发请求
2. **丢弃过期响应** —— 先发后到的请求不得覆盖更新的结果
3. **加载态与失败态** —— 失败时给出可重试的提示
4. **热门城市空状态** —— 打开搜索层且未输入时展示 `/geo/top` 的结果,失败则退回原提示文案

清空输入时取消进行中的请求。

## 不做什么

- **不保留静态城市列表作为降级方案。** GeoAPI 与和风天气同 host 同 key,GeoAPI 挂时和风天气
  大概率也挂了,用户即便切到别的城市也只能看彩云一家 —— 为这点收益维护两套搜索逻辑不划算。
- **不做 POI 相关功能**(景点天气、附近兴趣点)。
- **不让前端直连和风 GeoAPI**,API Key 不能出现在浏览器里,必须走后端代理。
- **不把地名塞进 `/weather` 响应**。那会弄浑一个纯粹的多源聚合契约,连带要改锁定契约的 e2e
  测试和 `backend/README.md`,而搜索仍需单开路由,等于两种风格并存。

## 测试策略

- **`formatLocationName`** — TDD,覆盖 `name === adm2`、直辖市区级、字段缺失
- **`QWeatherGeoProvider`** — 归一化(含 lat/lon 字符串转 number)、上游错误原因提取
- **`GeoService`** — 缓存命中不重复打上游、三个 key 互不串扰
- **`GeoController`** — e2e 锁定三个路由的契约,**包括上表那组不对称的失败行为**
- **前端 `api/geo.ts`** — fetch mock,含非 2xx 抛错
- **前端 `CitySearch`** — 防抖、竞态丢弃、失败态、热门城市空状态
- **回归** — 现有 70 个前端测试与 35 个后端测试保持通过;删除 `cities.ts` 会连带删掉它的 2 个测试
