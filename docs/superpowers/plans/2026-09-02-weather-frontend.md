# 天气对比 H5 前端(Vite + Vue3 + Pinia) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用已存在的 Vite + Vue3 + TypeScript + Pinia 脚手架实现天气对比 H5 页面:自动定位(失败则手动搜索城市)→ 调用后端 `GET /weather` → 并排展示各数据源的实时/逐小时/未来 3 天预报,单个数据源失败不影响其余卡片展示。

**Architecture:** `stores/weather.ts`(Pinia store)通过 `api/weather.ts` 调用后端聚合接口,把结果转成按 Provider 分组的 `ProviderSlot[]` 状态;`App.vue` 挂载时优先尝试浏览器定位(`composables/useGeolocation.ts`),失败则展示 `CitySearch.vue`(基于内置静态城市列表,不依赖后端做地理编码)供用户手动选择;`ProviderCard.vue` 负责渲染单个数据源的卡片,包括错误态。所有类型定义在 `types/weather.ts` 里与后端的 `NormalizedWeather` 等类型保持字段一致(前后端是两个独立部署的项目,不共享 npm 包,类型定义手动保持同步)。

**Tech Stack:** Vite、Vue 3(`<script setup>` + Composition API)、TypeScript、Pinia、Vitest + `@vue/test-utils` + jsdom(测试)

## Global Constraints

- 项目目录:`frontend/`(已用 Vite 脚手架创建,含 `package.json`/`vite.config.ts`/`src/` 等,不要重新创建,只在其基础上增改)
- 包管理器:项目自带 `bun.lock`(说明用户本地用 bun 管理依赖),但当前 claude-svc 执行环境没有装 bun,本计划所有命令统一用 npm 执行;这会额外生成 `package-lock.json`,与 `bun.lock` 共存不影响功能开发,后续如需统一包管理器由用户自行决定
- TypeScript 严格模式跟随 Vite 脚手架默认的 `tsconfig.json`/`tsconfig.app.json`,不额外放松
- 所有对后端的网络请求都通过 `frontend/src/api/` 目录下的封装函数发起,组件和 Pinia store 不直接调用 `fetch`
- Vitest 配置里开启 `globals: true`,测试文件里 `describe`/`it`/`expect`/`vi` 无需显式 import
- 后端 API 地址通过 `VITE_API_BASE_URL` 环境变量注入,默认值 `http://localhost:3000`,与后端计划(`docs/superpowers/plans/2026-09-02-weather-backend.md`)默认端口一致
- 手动搜索城市走**前端内置的静态城市列表**(`src/data/cities.ts`),不新增后端地理编码接口——MVP 阶段用一份精选的主要城市列表就够用,避免为"城市名转经纬度"这一件事再多接一个第三方地理编码 API
- 数据源标签(和风天气/彩云天气)在前端硬编码为中文展示名,新增数据源(如后续接入心知天气)时只需要在标签映射里加一行,不需要改动其余组件逻辑

### 后端契约的最终形态(2026-09-03 更新,前端必须按这个写)

后端已经实现完成并通过审查,期间契约有两处和本计划最初的假设不同,以下是**实际的、已被后端 e2e 测试锁定的**契约:

1. **`ProviderResult.message` 是一个固定的中文文案,不是原始异常文本。** 后端出于两个原因不再把上游错误直接透出:一是原始英文异常(如 `Request failed with status code 400`)对用户毫无意义,二是彩云天气的 token 拼在请求 URL 里,某些异常文本会带上完整 URL 从而泄露凭据。后端现在统一返回 `'数据源暂时不可用'`,详细原因只记在服务端日志里。
   **对前端的影响**:不要把这个 message 当作"技术细节"塞进括号里展示(那会渲染成"该数据源暂时不可用,请稍后重试(数据源暂时不可用)"这种重复文案),也不要试图解析它的内容来分支。它本身就是可以直接展示给用户的文案。
2. **`NormalizedDailyEntry.date` 保证是 `YYYY-MM-DD`。** 两家原始格式并不一致(和风天气 `2026-09-02`,彩云天气 `2026-09-02T00:00+08:00`),后端已在各自的 Provider 内部统一截断。前端可以放心直接用它做展示,也可以用它作为跨数据源按日期对齐的 key。
3. 其余字段(`tempC`/`feelsLikeC`/`conditionText`/`humidityPercent`/`windSpeedKph`、`hourly[].time`、单位统一为 °C / % / km/h)与本计划 Task 2 里的类型定义一致,已用真实 API 验证过。`hourly[].time` 是带时区偏移的 ISO 字符串(如 `2026-09-03T15:00+08:00`),两家格式一致。
4. **各数据源的 `daily` 长度不一定相同**:实测和风天气返回 7 天,彩云天气返回 3 天(免费版上限差异,后端刻意不截断)。前端渲染时不要假设两列行数相等。

---

### Task 1: 安装并配置 Vitest + Vue Test Utils

**Files:**
- Modify: `frontend/package.json`(新增 devDependencies 和 `test` script)
- Create: `frontend/vitest.config.ts`
- Test: `frontend/src/smoke.spec.ts`

**Interfaces:**
- Produces:`npm test` 命令(运行 `vitest run`)——供本计划后续所有任务使用

- [x] **Step 1: 先给已存在的 Vite 脚手架建一个基线提交**——`frontend/` 目录是在这份计划之前就用 Vite 创建好的,整个目录目前还没有被 git 追踪过,后续每个任务只会 `git add` 自己新建/修改的文件,如果不先提交一次基线,`index.html`/`tsconfig*.json`/`public/`/`README.md` 这些原始脚手架文件会一直停留在未跟踪状态。这一步只是记录现状,不涉及测试,不按 TDD 流程走。

```bash
cd /home/huangyingming/test-code/weather-app
git add frontend
git commit -m "$(cat <<'EOF'
Add existing Vite + Vue3 + TS + Pinia scaffold for the frontend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

- [x] **Step 2: 安装测试依赖**

```bash
cd frontend
npm install -D vitest @vue/test-utils jsdom
```

- [x] **Step 3: 在 `package.json` 里新增 `test` script**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  }
}
```

- [x] **Step 4: 写 `vitest.config.ts`**

```typescript
// frontend/vitest.config.ts
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      globals: true,
    },
  }),
);
```

- [x] **Step 5: 写一个不依赖任何业务代码的冒烟测试(先确认失败,因为这一步之前跑 `npm test` 命令本身还不存在)**

```typescript
// frontend/src/smoke.spec.ts
import { mount } from '@vue/test-utils';
import { defineComponent } from 'vue';

describe('vitest + vue test utils wiring', () => {
  it('mounts a minimal component and reads its rendered text', () => {
    const Counter = defineComponent({
      template: '<button @click="count++">{{ count }}</button>',
      data: () => ({ count: 0 }),
    });
    const wrapper = mount(Counter);
    expect(wrapper.text()).toBe('0');
  });
});
```

- [x] **Step 6: 运行测试确认通过**

```bash
npm test
```

预期:PASS(这一步是搭测试基础设施,没有先写"应该失败"的中间态可跳过,直接确认整条链路——安装依赖、配置文件、测试脚本——都跑得通)

- [x] **Step 7: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/smoke.spec.ts
git commit -m "$(cat <<'EOF'
Set up Vitest and Vue Test Utils for the frontend

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 天气数据类型定义 + 静态城市列表

**Files:**
- Create: `frontend/src/types/weather.ts`
- Create: `frontend/src/data/cities.ts`
- Test: `frontend/src/data/cities.spec.ts`

**Interfaces:**
- Produces:
  - `ProviderName`、`NormalizedWeather`、`NormalizedCurrentWeather`、`NormalizedHourlyEntry`、`NormalizedDailyEntry`、`ProviderResult`、`AggregatedWeatherResponse`(与后端 `backend/src/weather/interfaces/weather.interfaces.ts` 字段保持一致,供 Task 3 API 层使用)
  - `City { name: string; lat: number; lon: number }`、`CITIES: City[]`——供 Task 6 `CitySearch.vue` 使用

- [x] **Step 1: 定义天气数据类型(无独立测试,类型在下一个任务被消费验证)**

```typescript
// frontend/src/types/weather.ts
export type ProviderName = 'qweather' | 'caiyun';

export interface NormalizedCurrentWeather {
  tempC: number;
  feelsLikeC: number | null;
  conditionText: string;
  humidityPercent: number | null;
  windSpeedKph: number | null;
}

export interface NormalizedHourlyEntry {
  time: string;
  tempC: number;
  conditionText: string;
  precipitationProbabilityPercent: number | null;
}

export interface NormalizedDailyEntry {
  /** 后端保证为 `YYYY-MM-DD`(两家原始格式不同,已在后端各 Provider 内统一) */
  date: string;
  tempMinC: number;
  tempMaxC: number;
  conditionText: string;
  precipitationProbabilityPercent: number | null;
}

export interface NormalizedWeather {
  provider: ProviderName;
  updatedAt: string;
  current: NormalizedCurrentWeather | null;
  hourly: NormalizedHourlyEntry[];
  daily: NormalizedDailyEntry[];
}

export type ProviderResult =
  | { provider: ProviderName; status: 'ok'; data: NormalizedWeather }
  | { provider: ProviderName; status: 'error'; message: string };

export interface AggregatedWeatherResponse {
  results: ProviderResult[];
}
```

- [x] **Step 2: 写城市列表的失败测试**

```typescript
// frontend/src/data/cities.spec.ts
import { CITIES } from './cities';

describe('CITIES', () => {
  it('has no duplicate city names', () => {
    const names = CITIES.map((city) => city.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('keeps every coordinate within a rough mainland China bounding box', () => {
    for (const city of CITIES) {
      expect(city.lat).toBeGreaterThan(18);
      expect(city.lat).toBeLessThan(54);
      expect(city.lon).toBeGreaterThan(73);
      expect(city.lon).toBeLessThan(135);
    }
  });
});
```

- [x] **Step 3: 运行测试确认失败**

```bash
npm test -- cities.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 4: 实现静态城市列表**

```typescript
// frontend/src/data/cities.ts
export interface City {
  name: string;
  lat: number;
  lon: number;
}

export const CITIES: City[] = [
  { name: '北京', lat: 39.9042, lon: 116.4074 },
  { name: '上海', lat: 31.2304, lon: 121.4737 },
  { name: '广州', lat: 23.1291, lon: 113.2644 },
  { name: '深圳', lat: 22.5431, lon: 114.0579 },
  { name: '杭州', lat: 30.2741, lon: 120.1551 },
  { name: '成都', lat: 30.5728, lon: 104.0668 },
  { name: '武汉', lat: 30.5928, lon: 114.3055 },
  { name: '西安', lat: 34.3416, lon: 108.9398 },
  { name: '南京', lat: 32.0603, lon: 118.7969 },
  { name: '重庆', lat: 29.5630, lon: 106.5516 },
  { name: '天津', lat: 39.3434, lon: 117.3616 },
  { name: '苏州', lat: 31.2989, lon: 120.5853 },
  { name: '青岛', lat: 36.0671, lon: 120.3826 },
  { name: '长沙', lat: 28.2282, lon: 112.9388 },
  { name: '厦门', lat: 24.4798, lon: 118.0894 },
  { name: '哈尔滨', lat: 45.8038, lon: 126.5350 },
  { name: '沈阳', lat: 41.8057, lon: 123.4315 },
  { name: '昆明', lat: 25.0389, lon: 102.7183 },
  { name: '郑州', lat: 34.7466, lon: 113.6254 },
  { name: '济南', lat: 36.6512, lon: 117.1201 },
];
```

- [x] **Step 5: 运行测试确认通过**

```bash
npm test -- cities.spec.ts
```

预期:PASS

- [x] **Step 6: 提交**

```bash
git add frontend/src/types frontend/src/data
git commit -m "$(cat <<'EOF'
Add normalized weather types and a static city list for search

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: API 封装层(`fetchWeather`)

**Files:**
- Create: `frontend/src/api/weather.ts`
- Test: `frontend/src/api/weather.spec.ts`
- Create: `frontend/.env.example`

**Interfaces:**
- Consumes:`AggregatedWeatherResponse`(来自 Task 2)
- Produces:`fetchWeather(lat: number, lon: number): Promise<AggregatedWeatherResponse>`——供 Task 4 Pinia store 调用

- [x] **Step 1: 写失败测试**

```typescript
// frontend/src/api/weather.spec.ts
import { fetchWeather } from './weather';

describe('fetchWeather', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the backend /weather endpoint with lat/lon and returns the parsed JSON', async () => {
    const aggregated = { results: [] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(aggregated),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWeather(39.92, 116.41);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/weather\?lat=39\.92&lon=116\.41$/));
    expect(result).toEqual(aggregated);
  });

  it('throws when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWeather(39.92, 116.41)).rejects.toThrow('HTTP 500');
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- weather.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 `fetchWeather`**

```typescript
// frontend/src/api/weather.ts
import type { AggregatedWeatherResponse } from '../types/weather';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export async function fetchWeather(lat: number, lon: number): Promise<AggregatedWeatherResponse> {
  const response = await fetch(`${API_BASE_URL}/weather?lat=${lat}&lon=${lon}`);
  if (!response.ok) {
    throw new Error(`天气接口请求失败: HTTP ${response.status}`);
  }
  return response.json();
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- weather.spec.ts
```

预期:PASS

- [x] **Step 5: 写 `.env.example`**

```
# frontend/.env.example
VITE_API_BASE_URL=http://localhost:3000
```

确认 `frontend/.gitignore`(Vite 脚手架已自带)包含 `.env`;若没有,追加一行 `.env`。

- [x] **Step 6: 提交**

```bash
git add frontend/src/api frontend/.env.example
git commit -m "$(cat <<'EOF'
Add fetchWeather API wrapper for the backend /weather endpoint

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Pinia 天气 store

**Files:**
- Create: `frontend/src/stores/weather.ts`
- Test: `frontend/src/stores/weather.spec.ts`

**Interfaces:**
- Consumes:`fetchWeather`(Task 3)、`AggregatedWeatherResponse`/`NormalizedWeather`/`ProviderName`(Task 2)
- Produces:
  - `ProviderSlot { provider: ProviderName; status: 'ok' | 'error'; data: NormalizedWeather | null; errorMessage: string | null }`
  - `useWeatherStore()`,状态 `{ cityName: string | null; status: 'idle' | 'loading' | 'loaded' | 'error'; errorMessage: string | null; providers: ProviderSlot[] }`,action `loadWeather(lat, lon, cityName): Promise<void>`——供 Task 8 `App.vue` 和 Task 7 `ProviderCard.vue`(类型)使用

- [x] **Step 1: 写失败测试**

```typescript
// frontend/src/stores/weather.spec.ts
import { createPinia, setActivePinia } from 'pinia';
import { useWeatherStore } from './weather';
import * as weatherApi from '../api/weather';

describe('useWeatherStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates providers from a successful aggregated response', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-02T00:00:00+08:00',
            current: { tempC: 20, feelsLikeC: 20, conditionText: '晴', humidityPercent: 50, windSpeedKph: 10 },
            hourly: [],
            daily: [],
          },
        },
        { provider: 'caiyun', status: 'error', message: 'timeout' },
      ],
    });

    const store = useWeatherStore();
    await store.loadWeather(39.92, 116.41, '北京');

    expect(store.status).toBe('loaded');
    expect(store.cityName).toBe('北京');
    expect(store.providers).toEqual([
      {
        provider: 'qweather',
        status: 'ok',
        errorMessage: null,
        data: expect.objectContaining({ provider: 'qweather' }),
      },
      { provider: 'caiyun', status: 'error', data: null, errorMessage: 'timeout' },
    ]);
  });

  it('sets status to error when the request itself fails', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockRejectedValue(new Error('network down'));

    const store = useWeatherStore();
    await store.loadWeather(39.92, 116.41, '北京');

    expect(store.status).toBe('error');
    expect(store.errorMessage).toBe('network down');
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- weather.spec.ts
```

预期(注意这次是在 `stores/` 目录下,和 Task 3 的 `api/weather.spec.ts` 文件名相同但路径不同):模块不存在,报错失败。

- [x] **Step 3: 实现 `useWeatherStore`**

```typescript
// frontend/src/stores/weather.ts
import { defineStore } from 'pinia';
import { fetchWeather } from '../api/weather';
import type { NormalizedWeather, ProviderName } from '../types/weather';

export interface ProviderSlot {
  provider: ProviderName;
  status: 'ok' | 'error';
  data: NormalizedWeather | null;
  errorMessage: string | null;
}

interface WeatherStoreState {
  cityName: string | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  errorMessage: string | null;
  providers: ProviderSlot[];
}

export const useWeatherStore = defineStore('weather', {
  state: (): WeatherStoreState => ({
    cityName: null,
    status: 'idle',
    errorMessage: null,
    providers: [],
  }),
  actions: {
    async loadWeather(lat: number, lon: number, cityName: string) {
      this.cityName = cityName;
      this.status = 'loading';
      this.errorMessage = null;
      try {
        const aggregated = await fetchWeather(lat, lon);
        this.providers = aggregated.results.map((result) =>
          result.status === 'ok'
            ? { provider: result.provider, status: 'ok' as const, data: result.data, errorMessage: null }
            : { provider: result.provider, status: 'error' as const, data: null, errorMessage: result.message },
        );
        this.status = 'loaded';
      } catch (error) {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : '未知错误';
      }
    },
  },
});
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- stores/weather.spec.ts
```

预期:PASS

- [x] **Step 5: 提交**

```bash
git add frontend/src/stores
git commit -m "$(cat <<'EOF'
Add Pinia weather store to load and shape aggregated forecasts

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: `useGeolocation` 定位工具函数

**Files:**
- Create: `frontend/src/composables/useGeolocation.ts`
- Test: `frontend/src/composables/useGeolocation.spec.ts`

**Interfaces:**
- Consumes:(无,直接用浏览器原生 `navigator.geolocation`)
- Produces:`requestCurrentLocation(): Promise<{ lat: number; lon: number }>`——供 Task 8 `App.vue` 使用

- [x] **Step 1: 写失败测试**

```typescript
// frontend/src/composables/useGeolocation.spec.ts
import { requestCurrentLocation } from './useGeolocation';

describe('requestCurrentLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with lat/lon when the browser grants permission', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 39.92, longitude: 116.41 } } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const result = await requestCurrentLocation();

    expect(result).toEqual({ lat: 39.92, lon: 116.41 });
  });

  it('rejects when the browser denies permission', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ message: 'User denied Geolocation' } as GeolocationPositionError);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    await expect(requestCurrentLocation()).rejects.toThrow('User denied Geolocation');
  });

  it('rejects when the browser does not support geolocation', async () => {
    vi.stubGlobal('navigator', {});

    await expect(requestCurrentLocation()).rejects.toThrow('该浏览器不支持定位');
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- useGeolocation.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 `requestCurrentLocation`**

```typescript
// frontend/src/composables/useGeolocation.ts
export interface Coordinates {
  lat: number;
  lon: number;
}

export function requestCurrentLocation(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('该浏览器不支持定位'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
      (error) => reject(new Error(error.message)),
      { timeout: 8000 },
    );
  });
}
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- useGeolocation.spec.ts
```

预期:PASS

- [x] **Step 5: 提交**

```bash
git add frontend/src/composables
git commit -m "$(cat <<'EOF'
Add requestCurrentLocation geolocation helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: `CitySearch.vue` 组件

**Files:**
- Create: `frontend/src/components/CitySearch.vue`
- Test: `frontend/src/components/CitySearch.spec.ts`

**Interfaces:**
- Consumes:`CITIES`/`City`(Task 2)
- Produces:`<CitySearch @select="(city: City) => void" />`——供 Task 8 `App.vue` 使用

- [x] **Step 1: 写失败测试**

```typescript
// frontend/src/components/CitySearch.spec.ts
import { mount } from '@vue/test-utils';
import CitySearch from './CitySearch.vue';

describe('CitySearch', () => {
  it('filters cities by keyword and emits the selected city', async () => {
    const wrapper = mount(CitySearch);

    await wrapper.find('input').setValue('北');
    expect(wrapper.text()).toContain('北京');

    await wrapper.find('button').trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    expect(wrapper.emitted('select')![0][0]).toMatchObject({ name: '北京' });
  });

  it('shows no suggestions when the keyword is empty', () => {
    const wrapper = mount(CitySearch);
    expect(wrapper.findAll('li').length).toBe(0);
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- CitySearch.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 `CitySearch.vue`**

```vue
<!-- frontend/src/components/CitySearch.vue -->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { CITIES, type City } from '../data/cities';

const emit = defineEmits<{ select: [city: City] }>();

const keyword = ref('');

const matches = computed(() => {
  const trimmed = keyword.value.trim();
  if (!trimmed) {
    return [];
  }
  return CITIES.filter((city) => city.name.includes(trimmed));
});

function selectCity(city: City) {
  emit('select', city);
  keyword.value = '';
}
</script>

<template>
  <div class="city-search">
    <input v-model="keyword" type="text" placeholder="搜索城市" aria-label="搜索城市" />
    <ul v-if="matches.length > 0">
      <li v-for="city in matches" :key="city.name">
        <button type="button" @click="selectCity(city)">{{ city.name }}</button>
      </li>
    </ul>
  </div>
</template>
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- CitySearch.spec.ts
```

预期:PASS

- [x] **Step 5: 提交**

```bash
git add frontend/src/components/CitySearch.vue frontend/src/components/CitySearch.spec.ts
git commit -m "$(cat <<'EOF'
Add CitySearch component backed by the static city list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: `ProviderCard.vue` 组件

**Files:**
- Create: `frontend/src/components/ProviderCard.vue`
- Test: `frontend/src/components/ProviderCard.spec.ts`

**Interfaces:**
- Consumes:`ProviderSlot`(Task 4)
- Produces:`<ProviderCard :slot="ProviderSlot" />`——供 Task 8 `App.vue` 使用

- [x] **Step 1: 写失败测试**

```typescript
// frontend/src/components/ProviderCard.spec.ts
import { mount } from '@vue/test-utils';
import ProviderCard from './ProviderCard.vue';
import type { ProviderSlot } from '../stores/weather';

describe('ProviderCard', () => {
  it('renders current temperature and daily forecast when the provider succeeds', () => {
    const slot: ProviderSlot = {
      provider: 'qweather',
      status: 'ok',
      errorMessage: null,
      data: {
        provider: 'qweather',
        updatedAt: '2026-09-02T00:00:00+08:00',
        current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
        hourly: [],
        daily: [
          { date: '2026-09-02', tempMinC: 15, tempMaxC: 25, conditionText: '晴', precipitationProbabilityPercent: null },
        ],
      },
    };

    const wrapper = mount(ProviderCard, { props: { slot } });

    expect(wrapper.text()).toContain('和风天气');
    expect(wrapper.text()).toContain('20°C');
    expect(wrapper.text()).toContain('2026-09-02');
  });

  it('renders the hourly forecast list when hourly entries are present', () => {
    const slot: ProviderSlot = {
      provider: 'qweather',
      status: 'ok',
      errorMessage: null,
      data: {
        provider: 'qweather',
        updatedAt: '2026-09-02T00:00:00+08:00',
        current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
        hourly: [
          { time: '2026-09-02T15:00+08:00', tempC: 22, conditionText: '多云', precipitationProbabilityPercent: 20 },
        ],
        daily: [],
      },
    };

    const wrapper = mount(ProviderCard, { props: { slot } });

    expect(wrapper.text()).toContain('15:00');
    expect(wrapper.text()).toContain('22°C');
    expect(wrapper.text()).toContain('多云');
  });

  it('renders a fallback message when the provider failed', () => {
    const slot: ProviderSlot = {
      provider: 'caiyun',
      status: 'error',
      // 后端返回的就是这个固定文案(见 Global Constraints 里的"后端契约的最终形态")
      errorMessage: '数据源暂时不可用',
      data: null,
    };

    const wrapper = mount(ProviderCard, { props: { slot } });

    expect(wrapper.text()).toContain('数据源暂时不可用');
    expect(wrapper.text()).toContain('请稍后重试');
    // 后端的 message 本身就是给用户看的文案,不要重复包一层同义句
    expect(wrapper.text()).not.toContain('该数据源暂时不可用,请稍后重试(数据源暂时不可用)');
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- ProviderCard.spec.ts
```

预期:模块不存在,报错失败。

- [x] **Step 3: 实现 `ProviderCard.vue`**

```vue
<!-- frontend/src/components/ProviderCard.vue -->
<script setup lang="ts">
import { computed } from 'vue';
import type { ProviderSlot } from '../stores/weather';

const props = defineProps<{ slot: ProviderSlot }>();

const PROVIDER_LABELS: Record<string, string> = {
  qweather: '和风天气',
  caiyun: '彩云天气',
  seniverse: '心知天气',
};

const providerLabel = computed(() => PROVIDER_LABELS[props.slot.provider] ?? props.slot.provider);

// 从 ISO 时间字符串(如 "2026-09-02T15:00+08:00")里取出 "HH:mm" 展示,不用 Date 解析以避免时区换算干扰原始预报时间
function formatHour(isoTime: string): string {
  const match = isoTime.match(/T(\d{2}:\d{2})/);
  return match ? match[1] : isoTime;
}
</script>

<template>
  <section class="provider-card">
    <h3>{{ providerLabel }}</h3>

    <p v-if="slot.status === 'error'" class="provider-card__error">
      {{ slot.errorMessage ?? '数据源暂时不可用' }},请稍后重试
    </p>

    <template v-else-if="slot.data">
      <div v-if="slot.data.current" class="provider-card__current">
        <strong>{{ slot.data.current.tempC }}°C</strong>
        <span>{{ slot.data.current.conditionText }}</span>
      </div>
      <p v-else>暂无实时数据</p>

      <ul v-if="slot.data.hourly.length > 0" class="provider-card__hourly">
        <li v-for="hour in slot.data.hourly" :key="hour.time">
          {{ formatHour(hour.time) }} {{ hour.tempC }}°C {{ hour.conditionText }}
        </li>
      </ul>

      <ul v-if="slot.data.daily.length > 0" class="provider-card__daily">
        <li v-for="day in slot.data.daily" :key="day.date">
          {{ day.date }}:{{ day.tempMinC }}°C ~ {{ day.tempMaxC }}°C,{{ day.conditionText }}
        </li>
      </ul>
    </template>
  </section>
</template>
```

- [x] **Step 4: 运行测试确认通过**

```bash
npm test -- ProviderCard.spec.ts
```

预期:PASS

- [x] **Step 5: 提交**

```bash
git add frontend/src/components/ProviderCard.vue frontend/src/components/ProviderCard.spec.ts
git commit -m "$(cat <<'EOF'
Add ProviderCard component to render one data source's forecast

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: `App.vue` 整合(定位优先,失败 fallback 手动搜索)

**Files:**
- Modify: `frontend/src/App.vue`
- Test: `frontend/src/App.spec.ts`
- Modify: `frontend/src/main.ts`(安装 Pinia)
- Delete: `frontend/src/components/HelloWorld.vue`(Vite 默认脚手架占位组件,不再被引用)

**Interfaces:**
- Consumes:`useWeatherStore`(Task 4)、`requestCurrentLocation`(Task 5)、`CitySearch`(Task 6)、`ProviderCard`(Task 7)

- [x] **Step 1: 写失败测试**

```typescript
// frontend/src/App.spec.ts
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import * as weatherApi from './api/weather';

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads weather for the geolocated position on mount', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.92, longitude: 116.41 } } as GeolocationPosition),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-02T00:00:00+08:00',
            current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
            hourly: [],
            daily: [],
          },
        },
      ],
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(weatherApi.fetchWeather).toHaveBeenCalledWith(39.92, 116.41);
    expect(wrapper.text()).toContain('和风天气');
    expect(wrapper.text()).toContain('20°C');
  });

  it('shows a manual-search hint when geolocation is denied', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ message: 'User denied Geolocation' } as GeolocationPositionError),
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain('未获取到定位,请手动搜索城市查看天气');
  });
});
```

- [x] **Step 2: 运行测试确认失败**

```bash
npm test -- App.spec.ts
```

预期:`App.vue` 现在还是 Vite 默认脚手架内容,断言全部失败。

- [x] **Step 3: 重写 `App.vue`**

```vue
<!-- frontend/src/App.vue -->
<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useWeatherStore } from './stores/weather';
import { requestCurrentLocation } from './composables/useGeolocation';
import CitySearch from './components/CitySearch.vue';
import ProviderCard from './components/ProviderCard.vue';
import type { City } from './data/cities';

const store = useWeatherStore();
const locationDenied = ref(false);

async function selectCity(city: City) {
  locationDenied.value = false;
  await store.loadWeather(city.lat, city.lon, city.name);
}

onMounted(async () => {
  try {
    const coords = await requestCurrentLocation();
    await store.loadWeather(coords.lat, coords.lon, '当前位置');
  } catch {
    locationDenied.value = true;
  }
});
</script>

<template>
  <main class="app">
    <h1>天气对比</h1>

    <CitySearch @select="selectCity" />

    <p v-if="locationDenied" class="app__hint">未获取到定位,请手动搜索城市查看天气</p>

    <p v-if="store.status === 'loading'">加载中…</p>
    <p v-else-if="store.status === 'error'">{{ store.errorMessage }}</p>

    <div v-else-if="store.status === 'loaded'" class="app__cards">
      <ProviderCard v-for="slot in store.providers" :key="slot.provider" :slot="slot" />
    </div>
  </main>
</template>
```

- [x] **Step 4: 安装 Pinia 插件**

```typescript
// frontend/src/main.ts
import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';

createApp(App).use(createPinia()).mount('#app');
```

- [x] **Step 5: 删除不再使用的默认脚手架组件**

```bash
rm frontend/src/components/HelloWorld.vue
```

- [x] **Step 6: 运行测试确认通过**

```bash
npm test
```

预期:全部 PASS(包含前面所有任务的测试)

- [x] **Step 7: 浏览器手动走查(先不接后端,单纯验证交互)**

```bash
npm run dev
```

打开浏览器访问打印出来的本地地址,浏览器会弹出定位授权;先点"拒绝",确认能看到手动搜索提示和搜索框;搜一个城市试试下拉建议列表是否正常出现(此时因为后端还没启动,选中城市后请求会失败,能看到错误提示即可,数据联调放在 Task 9)。

- [x] **Step 8: 提交**

```bash
git add frontend/src/App.vue frontend/src/App.spec.ts frontend/src/main.ts
git rm frontend/src/components/HelloWorld.vue
git commit -m "$(cat <<'EOF'
Wire App.vue: geolocation-first flow with manual city search fallback

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 环境变量收尾 + 端到端手动验证

**Files:**
- (无新增代码,纯配置与联调)

**Interfaces:**
- Consumes:后端 `docs/superpowers/plans/2026-09-02-weather-backend.md` 实现完成后暴露的 `GET /weather?lat=&lon=`

- [x] **Step 1: 配置本地环境变量**

```bash
cd frontend
cp .env.example .env
```

确认 `.env` 里 `VITE_API_BASE_URL=http://localhost:3000` 和后端实际监听的地址一致。

- [x] **Step 2: 同时启动前后端**

```bash
# 终端一
cd backend && npm run start:dev

# 终端二
cd frontend && npm run dev
```

- [x] **Step 3: 浏览器端到端走查**

**前置条件**:`backend/.env` 里已经有真实可用的凭据(已由用户填入并验证过),所以这一步能拿到真实数据。实测参考值:和风天气返回 7 天逐日 + 24 小时逐小时,彩云天气返回 3 天 + 24 小时。

1. 打开前端页面,允许定位权限,确认能看到和风天气、彩云天气两张卡片,展示真实的实时天气和逐日预报。**注意两家的 `daily` 长度不同(7 天 vs 3 天),重点确认长短不一时布局不错乱、不报错**
2. 顺手核对一下两家数据的合理性:温度差在几度以内、风速在同一量级(如果彩云天气的风速看起来是和风天气的 3 倍多,说明单位换算又出问题了——后端曾经有过这个 bug)、`daily` 里的日期都是 `YYYY-MM-DD` 形式
3. 刷新页面并这次拒绝定位权限,确认出现"未获取到定位,请手动搜索城市查看天气"提示;用 `CitySearch` 搜索一个城市并选中,确认两张卡片正常刷新为该城市的数据
4. 验证单数据源失败不影响另一家:**不要改用户的 `backend/.env`**,而是用环境变量覆盖启动一个坏 token 的后端实例,例如
   ```bash
   cd backend && set -a && . ./.env && set +a && CAIYUN_TOKEN=deliberatelyBad npm run start:dev
   ```
   刷新前端页面,确认彩云天气卡片显示"数据源暂时不可用,请稍后重试",而和风天气卡片依然正常展示真实数据(这是整个产品的核心降级目标在前端的体现)
5. 用正常的后端实例重启,确认恢复正常

- [x] **Step 4: 跑一次全量测试确保没有回归**

```bash
cd frontend
npm test
```

预期:全部测试 PASS。

- [x] **Step 5: 提交(如果 Step 1-4 过程中有任何代码微调)**

```bash
cd /home/huangyingming/test-code/weather-app
git status
```

如果有未提交的改动,按前面任务同样的方式提交;如果 Step 1-4 只是验证、没有产生代码改动,这一步跳过即可。
