# updatedAt 用本地时钟,忽略了响应里的 server_time

Status: ready-for-human
来源: 2026-09-03 对照彩云 v2.6 官方文档的逐字段核查

## 问题

`caiyun.provider.ts` 用 `new Date().toISOString()` 作为 `updatedAt`,而彩云响应顶层返回
`server_time`(unix 秒),另有 `tzshift` / `timezone`。

## 后果

显示的"更新时间"是本服务收到响应的时刻,不是彩云出数的时刻。彩云实况是分钟级滚动发布、
日预报是批量发布(通常 2~4 次/日),叠加 `WeatherService` 的 30 分钟缓存后,页面上的
"刚刚更新"可能对应一份几小时前的日预报。

属于展示性误导,不是数值错误。

## 建议

`new Date(body.server_time * 1000).toISOString()`(注意是秒不是毫秒)。

标记为 ready-for-human 是因为这涉及产品判断:`updatedAt` 到底该表达"我们什么时候取的数"
还是"上游什么时候出的数"。两家 Provider 要统一口径(和风侧目前也是本地时钟)。
