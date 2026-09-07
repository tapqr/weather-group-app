// 和风天气用 Error Code v2:失败时返回 HTTP 4xx/5xx,body 形如
// { error: { status, title, detail, invalidParams? } }。axios 的 message 只有
// "Request failed with status code 400",会丢掉 detail 里那句真正有用的说明。
export function describeUpstreamError(error: unknown): string {
  const detail = (error as { response?: { data?: { error?: { title?: string; detail?: string } } } })?.response?.data
    ?.error;
  if (detail?.title) {
    return detail.detail ? `${detail.title}: ${detail.detail}` : detail.title;
  }
  return error instanceof Error ? error.message : String(error);
}
