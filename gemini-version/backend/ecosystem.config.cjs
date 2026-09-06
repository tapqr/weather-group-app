const path = require('path');

module.exports = {
  apps: [
    {
      name: 'weather-backend-agy',
      script: 'dist/main.js',
      cwd: __dirname,
      instances: 1, // 进程实例数，轻量单机填 1；多核高并发可填 2 或 'max'
      exec_mode: 'fork', // 单实例推荐 'fork'，多核负载均衡设为 'cluster'
      autorestart: true, // 进程异常退出时自动拉起
      watch: false, // 生产环境关闭文件监听，避免因写日志引起频繁重启
      max_memory_restart: '500M', // 内存超过 500M 自动平滑重启，防止内存泄漏
      restart_delay: 3000, // 异常崩溃后延迟 3 秒重启
      max_restarts: 10, // 限制短时间异常重启最大次数，防止死循环
      min_uptime: '10s', // 启动后平稳运行 10s 以上计为成功

      // 默认生产环境变量 (backend/.env 中的配置会自动合并覆盖)
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        SUBPATH: 'agy',
      },
      env_development: {
        NODE_ENV: 'development',
        PORT: 3000,
        SUBPATH: 'agy',
      },

      // PM2 运行日志配置 (自动输出到 backend/logs/)
      out_file: path.join(__dirname, 'logs/pm2-out.log'),
      error_file: path.join(__dirname, 'logs/pm2-err.log'),
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // 优雅停机超时
      kill_timeout: 5000,
    },
  ],
};
