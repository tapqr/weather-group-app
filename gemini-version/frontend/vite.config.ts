import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // 子路径配置，默认为 /agy/，可通过环境变量 VITE_BASE_PATH 自定义
  const rawBase = env.VITE_BASE_PATH !== undefined ? env.VITE_BASE_PATH : '/agy/';
  const base = rawBase.startsWith('/') ? (rawBase.endsWith('/') ? rawBase : `${rawBase}/`) : `/${rawBase}/`;
  const baseWithoutTrailingSlash = base.slice(0, -1);

  return {
    base,
    plugins: [vue()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        // 代理子路径下的 API 请求: 例如 /agy/api/... -> http://localhost:3000/agy/api/...
        [`^${baseWithoutTrailingSlash}/api`]: {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
        // 兼容直接访问 /api/...
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  };
});
