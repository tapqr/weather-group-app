import type { ConfigService } from '@nestjs/config';

// 这些是持有第三方凭据、拼接上游 URL 所必需的配置项。configuration.ts 里它们的默认值都是
// 空字符串,如果不在启动时校验,应用会"看起来很健康"地启动起来,但 apiHost 为空时
// `https://${apiHost}/v7/weather/now` 会变成主机名是 v7 的 URL——同时真实 API Key 照样会被发过去;
// 运维也完全无法区分"配置漏了"和"第三方挂了"。
// 错误信息里只写变量名,不打印值。
const REQUIRED_ENV_KEYS: Array<{ configPath: string; envVar: string }> = [
  { configPath: 'qweather.apiHost', envVar: 'QWEATHER_API_HOST' },
  { configPath: 'qweather.apiKey', envVar: 'QWEATHER_API_KEY' },
  { configPath: 'caiyun.token', envVar: 'CAIYUN_TOKEN' },
];

export function assertRequiredConfig(configService: Pick<ConfigService, 'get'>): void {
  const missing = REQUIRED_ENV_KEYS.filter(({ configPath }) => !configService.get<string>(configPath)).map(
    ({ envVar }) => envVar,
  );
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}
