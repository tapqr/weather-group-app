import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// base 决定构建产物里静态资源的引用前缀。默认 '/' 供本地开发使用;
// 部署到子路径时用 VITE_BASE_PATH 指定(如 /weather-app/),否则 index.html 会去
// 根路径找 /assets/*.js 而 404。注意它是**构建时**确定的,改了必须重新 build。
export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [vue()],
})
