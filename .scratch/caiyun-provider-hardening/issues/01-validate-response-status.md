# 彩云 Provider 缺少响应体 status/error 校验

Status: resolved
来源: 2026-09-03 对照彩云 v2.6 官方文档的逐字段核查

## 问题

`caiyun.provider.ts` 直接解构 `response.data.result`,既不判 `status === 'ok'`,也不读 `error` 字段。

文档(https://docs.caiyunapp.com/weather-api/v2/v2.6/tables/errors.html)明确失败时返回:

```json
{ "status": "failed", "error": "token is invalid", "api_version": "2.6" }
```

并列出 400(token 不合法)、401(无权限)、403(被禁用/IP 不在白名单)、422(参数错误)、
429(额度用完或 QPS 限流,带 `Retry-After` 响应头)、500 等状态码。

## 后果

不会给用户看到伪造数据(失败体里没有 `result` 键,解构会抛 TypeError 被 `allSettled` 兜住),
但**失败原因全部丢失**。服务端日志只会看到
`Cannot destructure property 'realtime' of 'response.data.result'` 或
`Request failed with status code 429`,而不是文档里那句有用的 `"token is invalid"`。

排障时"彩云挂了"永远查不出到底是欠费、限流,还是 IP 白名单。429 带的 `Retry-After` 也被无视,
故障期间会持续硬打上游。

**关键不对称**:和风侧专门写了 `describeUpstreamError()`(`qweather.provider.ts`)把
`error.title/detail` 提取出来,注释还说明了"axios 的 message 会丢掉 detail 里真正有用的说明"。
彩云侧完全没有对等处理。

## 建议

解构前加闸:

```ts
const body = response.data;
if (body?.status !== 'ok' || !body.result) {
  throw new Error(`彩云天气返回失败: ${body?.error ?? body?.status ?? 'unknown'}`);
}
```

`error` 字段纳入类型定义。可顺带在 axios 错误分支里读 `err.response?.data?.error` 和 `Retry-After`。

注意保持现有约定:抛出的详细原因只进服务端日志,给前端的 `message` 仍是固定文案
`'数据源暂时不可用'`(彩云 token 拼在 URL 里,原始异常文本会泄露凭据)。

## 已解决(2026-09-03)

实现时发现原方案只做了一半:彩云的失败是**用 HTTP 状态码**表达的(实测坏 token 返回
HTTP 400 + `{"status":"failed","error":"token is invalid"}`),axios 会直接抛,
**根本走不到响应体校验那道闸**。只加校验的话日志里仍然是那句没用的
`Request failed with status code 400`。

所以最终做了两件事:

1. 解构前校验 `status === 'ok' && result`(防御 HTTP 200 但体内失败的情况)
2. 新增 `describeUpstreamError()`,从 `error.response.data` 里提取真实原因,
   429 时连 `Retry-After` 一起带上(限流响应体是纯文本,不是 JSON,已分别处理)

实测效果:
```
修复前:Provider "caiyun" 请求失败: Request failed with status code 400
修复后:Provider "caiyun" 请求失败: 彩云天气请求失败: token is invalid
```
给前端的 message 仍是固定文案 `数据源暂时不可用`,token 没有泄露。
