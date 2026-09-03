# feelsLikeC 可能写入 undefined 而非契约要求的 null

Status: resolved
来源: 2026-09-03 对照彩云 v2.6 官方文档的逐字段核查

## 问题

`caiyun.provider.ts` 把 `apparent_temperature` 声明为必填 `number` 并直接透传给 `feelsLikeC`。

文档把该字段列为无条件返回的 `number`,没有套餐/权限限制说明;2026-09-03 实测北京也确实返回了
`apparent_temperature: 29.6`。但覆盖表(tables/coverage.html)列举实况数据时**没有列出体感温度**,
是个弱信号。

## 后果

一旦上游不返回该字段,`feelsLikeC` 会是 `undefined`,违反 `weather.interfaces.ts` 的
`number | null` 契约。`JSON.stringify` 会把该 key 整个丢掉,前端拿到的是"字段不存在"而不是 `null`,
若前端写 `feelsLikeC === null ? '—' : ...` 就会漏判,渲染出 `undefined°`。

和风侧同一字段是防御式的:`feelsLikeC: now.feelsLike ? Number(now.feelsLike) : null`。

## 建议

改为 `apparent_temperature?: number` + `feelsLikeC: realtime.apparent_temperature ?? null`,
与和风侧对齐。`humidity`、`wind.speed` 同理。

## 已解决(2026-09-03)

注意:这一条与 02 在类型上是耦合的 —— 把子块设为可选后,`apparent_temperature` 的类型
变成 `number | undefined`,不加 `?? null` 就通不过类型检查,所以它没有走独立的 RED。
补救方式是先写测试确认通过,再故意把 `?? null` 去掉验证测试确实变红,证明测试有效。

`humidity` 和 `wind.speed` 一并做了同样处理。
