# 🌤️ 天气预报双源对比 H5 应用 (彩云天气 vs 和风天气)

这是一个基于 **Vite + Vue 3** 前端与 **NestJS** 后端构建的移动端 H5 天气预报对比系统。通过同时接入并聚合 **彩云天气 (Caiyun Weather)** 与 **和风天气 (QWeather)** 两个主流气象数据源，同屏比对多维度气象指标，帮助用户直观掌握天气预报的一致性与分歧。

---

## 📱 核心功能特性

1. **智能预报对比与共识报告**
   - 自动对比两源预报，智能判定「双源高度一致」、「基本吻合」或「存在明显分歧」。
   - 生成气温差异分析与降雨分歧警报（如：彩云预报有小雨 vs 和风预报多云无雨）。
2. **实时天气同屏对比卡片**
   - **彩云天气 (天蓝主题)** 与 **和风天气 (暖琥珀主题)** 左右并排对比。
   - 核心指标：实时气温、体感温度、天气现象、相对湿度、风向风力、空气质量 (AQI & PM2.5)、气压与能见度。
   - 智能高亮温差与指标差值。
3. **彩云特色：两小时短临分钟级降水雷达**
   - 彩云天气特色 120 分钟逐分钟雷达降水强度模拟与 AI 总结，对比和风天气短临判定。
4. **24 小时逐时气温走势双线图 (ECharts)**
   - 彩云（蓝）与和风（黄）双温曲线叠加绘制，支持触摸/鼠标悬停精确比对。
   - 支持「趋势曲线图」与「横向卡片列表」一键切换。
   - 包含逐小时降水概率 (POP) 标识。
5. **未来 7 天天气趋势与一致性评级**
   - 日期、昼夜天气状况、最高/最低温对比。
   - 每一天的双源一致性标签（高度一致 / 基本吻合 / 分歧显著）。
6. **城市搜索与快速切换**
   - 覆盖国内热门城市快捷标签（北京、上海、广州、深圳、杭州、成都、武汉、西安等）。
   - 支持关键词实时搜索匹配与浏览器定位。
7. **开箱即用高保真演练引擎**
   - 内置高拟真模拟算法，**即使暂未申请 API Key 也能直接运行演练全套对比界面**；
   - 在 `.env` 配置官方 Key 后，后端自动平滑切换至官方真实数据。

---

## 🛠️ 技术架构

- **前端 (Frontend)**
  - 构建工具：**Vite 5**
  - 核心框架：**Vue 3 (Composition API, `<script setup lang="ts">`)**
  - 样式方案：**Tailwind CSS** (移动端 H5 响应式、毛玻璃磨砂质感、深色护眼模式)
  - 数据可视化：**ECharts 5**
  - 图标体系：**Lucide Vue Next**
  - 接口请求：**Axios** (配置 Vite 反向代理解决跨域)
- **后端 (Backend)**
  - 核心框架：**NestJS 10 (TypeScript)**
  - 服务分层：
    - `WeatherController`: 路由控制器 (`/api/weather/compare`, `/api/weather/cities`, `/api/weather/status`)
    - `WeatherService`: 双源聚合与差异算法分析引擎
    - `CaiyunService`: 彩云天气 API 适配与解析
    - `QWeatherService`: 和风天气 API 适配与解析
    - `GeoService`: 城市坐标与地理位置解析
  - 配置管理：**@nestjs/config**

---

## 🚀 快速启动指南

### 1. 根目录下并行启动前后端 (推荐)

在根目录 `D:\source\test\weather-app` 下执行：

```bash
# 安装根目录依赖 (如首次运行)
npm install

# 一键同时启动 NestJS 后端 (3000) 与 Vite 前端 (5173)
npm run dev
```

启动完成后：
- **H5 前端访问地址**：[http://localhost:5173/agy/](http://localhost:5173/agy/)
  > 访问根路径 `http://localhost:5173` 会自动提示/跳转至 `/agy/`。建议在 Chrome / Edge 中按 `F12` 开启移动端设备模拟器体验。
- **后端接口地址**：[http://localhost:3000/agy/api/weather/compare?city=北京](http://localhost:3000/agy/api/weather/compare?city=北京) (同时兼容直接访问 `/api/weather/compare`)

---

### 2. 单独启动方式

若需分别单独启动：

#### 启动后端 (NestJS)
```bash
cd backend
npm run start:dev
# 服务运行在 http://localhost:3000
```

#### 启动前端 (Vite)
```bash
cd frontend
npm run dev
# 页面运行在 http://localhost:5173
```

---

## 🔑 配置真实 API Key (可选)

本项目默认内置了高保真演练模式，即使不配置任何 Key 也可以完整体验所有交互和对比功能。

若要连接官方真实气象数据，请打开 `backend/.env` 文件配置对应 Key：

```ini
PORT=3000

# 彩云天气 Token (在 https://platform.caiyunapp.com 免费申请)
CAIYUN_TOKEN=您的彩云天气Token

# 和风天气 API Key (在 https://dev.qweather.com 免费申请)
QWEATHER_API_KEY=您的和风天气Key
```

保存后重启后端，页面右上角的状态指示灯将转为绿色「实时」，即可读取双源真实气象数据。

---

## 📁 目录结构

```
weather-app/
├── package.json              # 根项目管理脚本 (concurrently 协同启动)
├── backend/                  # NestJS 后端服务
│   ├── src/
│   │   ├── weather/          # 天气与对比模块
│   │   │   ├── caiyun.service.ts       # 彩云天气 API 客户端 & 模拟演练引擎
│   │   │   ├── qweather.service.ts     # 和风天气 API 客户端 & 模拟演练引擎
│   │   │   ├── weather.service.ts      # 智能预报对比与分歧分析算法
│   │   │   ├── geo.service.ts          # 城市坐标检索服务
│   │   │   ├── weather.controller.ts   # RESTful 接口
│   │   │   ├── weather.interface.ts    # TypeScript 强类型接口定义
│   │   │   └── weather.module.ts
│   │   ├── app.module.ts
│   │   └── main.ts           # 后端入口 (启用 CORS, 监听 3000)
│   ├── .env                  # 环境变量配置
│   ├── .env.example
│   └── package.json
└── frontend/                 # Vite + Vue 3 H5 前端
    ├── src/
    │   ├── components/
    │   │   ├── HeaderNav.vue              # 顶部导航、城市切换与数据源状态
    │   │   ├── ComparisonSummaryCard.vue  # 智能双源预报对比报告 & 分歧警报
    │   │   ├── RealtimeCompareCard.vue    # 实时温度与多维度指标并排对比卡片
    │   │   ├── MinutelyRainRadar.vue      # 彩云 2 小时短临逐分钟降水雷达
    │   │   ├── HourlyCompareChart.vue     # 24 小时双源温差叠加图 (ECharts)
    │   │   ├── DailyForecastCompare.vue   # 7 天趋势与一致性评级列表
    │   │   ├── CitySelectModal.vue        # 城市选择与搜索抽屉
    │   │   ├── SettingsModal.vue          # 数据源配置指南与说明
    │   │   └── WeatherIcon.vue            # 天气图标渲染组件
    │   ├── services/api.ts                # Axios API 封装
    │   ├── types/weather.ts               # 前端类型定义
    │   ├── style.css                      # Tailwind 与玻璃态质感样式
    │   ├── App.vue                        # 主页面布局 (移动端 H5 容器)
    │   └── main.ts
    ├── vite.config.ts                     # 配置后端反向代理
    ├── tailwind.config.js
    └── package.json
```

---

## 🌐 子路径部署指南 (如 `domain/agy/`)

本项目已完整原生支持在子路径下运行（例如 `http://your-domain.com/agy/`）。

### 1. 核心环境变量配置

| 位置 | 变量名 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `frontend/.env` | `VITE_BASE_PATH` | `/agy/` | 前端基础路径，对应静态资源与页面挂载子路径 |
| `frontend/.env` | `VITE_API_BASE_URL` | *(选填)* | 独立 API 接口基地址（留空则自动根据当前子路径拼接） |
| `backend/.env` | `SUBPATH` | `agy` | 后端服务子路径，自动重写 API 接口并支持静态托管 |

### 2. 部署方案 A：Nginx 反向代理模式（推荐生产使用）

由 Nginx 直接托管前端静态资源并将 API 请求反向代理给 Node.js 后端。完整配置示例可参考 [`nginx.conf.example`](./nginx.conf.example)：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 1. 前端 H5 页面托管
    location /agy/ {
        alias /path/to/weather-app/frontend/dist/;
        index index.html;
        try_files $uri $uri/ /agy/index.html;
    }

    # 2. 后端 API 反向代理
    location /agy/api/ {
        proxy_pass http://127.0.0.1:3000/agy/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 3. 部署方案 B：后端一体化单进程托管（开箱即测）

只需执行全量构建并启动后端：
```bash
# 1. 执行全量构建 (生成 frontend/dist 与 backend/dist)
npm run build

# 2. 启动生产模式后端
npm run start:backend
```
后端检测到 `frontend/dist` 产物后，将**自动开启静态资源托管与根目录跳转**：
- 浏览器打开 `http://localhost:3000/` 将自动重定向到 `http://localhost:3000/agy/`
- API 接口在 `http://localhost:3000/agy/api/weather/compare` 正常对外提供服务
