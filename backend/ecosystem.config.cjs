// PM2 进程配置。文件名必须是 .cjs —— backend/package.json 里是 "type": "module",
// 而 PM2 用 require() 读这个配置,叫 .js 会被当成 ESM 而报错。
//
// 用法(在 backend/ 目录下):
//   pm2 start ecosystem.config.cjs --env production
//   pm2 reload weather-app-api        # 改代码后重载
//   pm2 logs weather-app-api          # 看日志
module.exports = {
  apps: [
    {
      name: 'weather-app-api',
      script: 'dist/main.js',
      cwd: __dirname,

      // ⚠️ 必须是 1,不要改成 cluster 或多实例。
      //
      // 这个服务有两处**进程内状态**:
      //   1. 限流(@nestjs/throttler 默认内存存储)—— 多进程会让每个进程独立计数,
      //      GEO_THROTTLE_LIMIT=20 在 4 个进程下实际变成 80
      //   2. 缓存(@cacheable/memory 的 LRU)—— 多进程各持一份,命中率骤降,
      //      打给和风/彩云的真实请求量翻几倍,免费额度会被刷穿
      //
      // 而且它是 IO 密集型(等第三方 API 返回),不是 CPU 密集型,多核收益本就有限。
      // 确实需要横向扩展时,得先把限流和缓存都换成 Redis 再谈。
      instances: 1,
      exec_mode: 'fork',

      // .env 由 dotenv 在应用内加载(@nestjs/config),这里只兜底 NODE_ENV
      env_production: {
        NODE_ENV: 'production',
      },

      // 崩溃重启,但要防抖:短时间内反复崩说明是配置问题(比如凭据缺失导致启动即失败),
      // 无限重启只会刷爆日志
      autorestart: true,
      max_restarts: 10,
      min_uptime: '30s',
      restart_delay: 3000,

      // 内存兜底。正常工作集远小于此;真涨到这里说明缓存的 LRU 上限没起作用
      max_memory_restart: '400M',

      error_file: 'logs/pm2-error.log',
      out_file: 'logs/pm2-out.log',
      merge_logs: true,
      time: true,
    },
  ],
};
