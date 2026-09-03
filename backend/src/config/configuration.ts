export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  cache: {
    ttlSeconds: parseInt(process.env.WEATHER_CACHE_TTL_SECONDS ?? '1800', 10),
    // 全部数据源都失败时用的短 TTL:够挡住瞬间的重复请求,又能让服务恢复后很快自愈
    failureTtlSeconds: parseInt(process.env.WEATHER_CACHE_FAILURE_TTL_SECONDS ?? '60', 10),
  },
  qweather: {
    apiHost: process.env.QWEATHER_API_HOST ?? '',
    apiKey: process.env.QWEATHER_API_KEY ?? '',
  },
  caiyun: {
    token: process.env.CAIYUN_TOKEN ?? '',
  },
  throttle: {
    ttlMs: parseInt(process.env.THROTTLE_TTL_MS ?? '60000', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT ?? '30', 10),
  },
  geo: {
    // 地理数据几乎不变,TTL 开得比天气长得多(天气是 1800)
    cacheTtlSeconds: parseInt(process.env.GEO_CACHE_TTL_SECONDS ?? '86400', 10),
    throttleTtlMs: parseInt(process.env.GEO_THROTTLE_TTL_MS ?? '60000', 10),
    // 注意:@nestjs/throttler 的限流 key 按 ClassName-HandlerName-limiterName-ip 生成,
    // 是 per-route 的 —— 这个值是 /geo/reverse、/geo/search、/geo/top 各自的额度,
    // 三个路由合计是它的 3 倍。默认 20 即合计 60/min/IP,对应原本的限流意图。
    throttleLimit: parseInt(process.env.GEO_THROTTLE_LIMIT ?? '20', 10),
  },
  // 子路径部署时的接口前缀。默认空 —— 本地开发接口就挂在根路径(/weather、/geo/*),
  // 与既有行为一致。生产部署在 https://域名/weather-app/ 下时设为 'api',接口变成
  // /api/weather,由 nginx 把外部的 /weather-app/api/ 转发过来(见 docs/DEPLOYMENT.md)。
  // 削掉前后斜杠,否则 setGlobalPrefix('/api/') 会拼出 //api/weather 这种路径
  apiPrefix: (process.env.API_PREFIX ?? '').replace(/^\/+|\/+$/g, ''),
});
