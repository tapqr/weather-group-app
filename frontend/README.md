# 天气对比 · 前端

移动端 H5 页面(Vite + Vue 3 `<script setup>` + TypeScript + Pinia)。定位优先,失败则手动搜索城市,把各数据源的预报并排展示。

产品背景与后端接口见[根目录 README](../README.md) 和 [`backend/README.md`](../backend/README.md)。

## 开发

```bash
npm install
cp .env.example .env    # 默认指向 http://localhost:3000
npm run dev             # 端口 5173
```

需要后端同时跑起来才有数据。后端的 `CORS_ORIGIN` 默认就是 `http://localhost:5173`。

| 命令 | 说明 |
|---|---|
| `npm test` | Vitest + jsdom + Vue Test Utils |
| `npm test -- src/stores/weather.spec.ts` | 跑单个测试文件 |
| `npm run build` | `vue-tsc` 类型检查 + 构建,**类型错误会阻断构建** |
| `npm run preview` | 预览构建产物 |

## 环境变量

| 变量 | 作用 | 默认值 |
|---|---|---|
| `VITE_API_BASE_URL` | 后端地址 | `http://localhost:3000` |

## 几个必须知道的约定

### 类型是后端契约的手抄副本

`src/types/weather.ts` 和 `src/types/location.ts` 分别是后端 `weather.interfaces.ts` 和 `geo.interfaces.ts` 的手抄副本 —— 两个项目独立部署、不共享 npm 包。**改后端契约必须同步改这里,没有任何自动检查会提醒你。**

### 配色由两个 data 属性驱动

- `<html data-daypart="day|twilight|night">` —— 由 `App.vue` 按**本地时间**写入,决定页面底色和文字明度
- `.provider-card[data-condition="clear|cloudy|rain|snow|haze|wind|unknown"]` —— 由天气文案分类得出,决定每张卡片的色调

**页面背景始终比卡片浅**,卡片是"沉"进去的。所以卡片的半透明层用的是压暗方向的深色,而不是常见的白色蒙版。夜间另有一套 tint —— 给浅背景准备的彩色半透明层叠到暗夜空上方向会反过来(在暗底上是提亮的),卡片反而会浮到背景之上。

这套配色**刻意不跟随 `prefers-color-scheme`**:天气应用的配色是内容的一部分(它在表达"外面现在什么样"),不是界面外壳偏好。

### 展示逻辑抽成了纯函数

`src/utils/` 下的函数出错的方式都是**静默的** —— 分类兜底了、昼夜判反了、取整错了,页面照样渲染不报错,只是显示得不对。所以每个都有测试兜底,改动时别绕过:

- `weather-display.ts` —— `classifyCondition`(关键词顺序即优先级:「雪」在「雨」前,「云」在「晴」前)、`resolveDayPart`、`formatTemperature`、`formatWindSpeed`
- `location-display.ts` —— `formatLocationName`(直辖市反查出来是区级;地级市的 `name` 与 `adm2` 重复,无脑拼接会得到"厦门 厦门")

### 两家数据源的逐日天数不同

和风 7 天、彩云 3 天(免费版差异,后端刻意不截断)。**渲染时不要假设各列行数相等。**

## 容易踩的坑

- **`vitest.config.ts` 开了 `globals: true`,但 TypeScript 需要单独声明。** `tsconfig.app.json` 的 `types` 里有 `vitest/globals`,删掉它 `npm run build` 会在每个 spec 文件上报错。
- **`index.html` 的 viewport 带 `viewport-fit=cover`**,这是 CSS 里 `env(safe-area-inset-*)` 生效的前提。去掉它刘海屏顶部会被挡。
- **npm / bun 混用**:仓库里 `bun.lock` 和 `package-lock.json` 并存,当前依赖由 npm 管理。用 bun 重装会改变 `node_modules` 的属主与 ACL。
