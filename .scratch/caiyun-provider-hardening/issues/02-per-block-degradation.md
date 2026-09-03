# 彩云子块缺失会导致整个数据源崩溃,降级粒度与和风不一致

Status: resolved
来源: 2026-09-03 对照彩云 v2.6 官方文档的逐字段核查

## 问题

`caiyun.provider.ts` 直接 `hourly.temperature.map(...)` / `daily.temperature.map(...)`,
没有空值兜底。`CaiyunWeatherResponse` 接口里也没声明各子块的 `status` 字段。

实测确认 `result.realtime.status` / `result.hourly.status` / `result.daily.status` 三个字段
确实存在(正常时为 `"ok"`),但文档从未说明它们非 `ok` 时的取值含义,也没写此时数组是否仍存在。

## 后果

若某个子块降级(例如该点位无小时级覆盖)导致 `hourly.temperature` 缺失,会抛
`Cannot read properties of undefined (reading 'map')`,**整个彩云数据源被判死** ——
连本来正常的实况和日预报也一起丢掉,用户看到"彩云:数据源暂时不可用"。

**关键不对称**:和风侧是三段独立 `Promise.allSettled`(now/24h/7d),缺哪段留 `null`/`[]`,
只有三者全挂才整体抛错。两个 Provider 的降级粒度不在一个水平线上。

## 建议

给数组访问加空值兜底(`hourly?.temperature ?? []`),子块缺失时退化为空数组而不是整体失败;
`realtime` 缺失时 `current` 置 `null`(契约本来就允许 `current: NormalizedCurrentWeather | null`)。

顺带把三个子块的 `status` 纳入判断。
