# 用和风 GeoAPI 显示真实地名 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把前端硬编码的"当前位置"换成和风 GeoAPI 反查出的真实地名,并把城市搜索从 20 城静态列表换成 GeoAPI 实时搜索、用热门城市填充搜索层空状态。

**Architecture:** 后端新增与 `src/weather/` 平行的 `src/geo/` 模块,三层各一职责:`QWeatherGeoProvider` 调和风 GeoAPI 并归一化,`GeoService` 管缓存,`GeoController` 管路由与校验。对外开三个路由(`/geo/reverse`、`/geo/search`、`/geo/top`),失败行为刻意不对称。前端新增 `api/geo.ts` 与纯函数 `utils/location-display.ts`,`App.vue` 并行请求天气与地名(地名不阻塞天气),`CitySearch.vue` 从同步数组过滤改为带防抖的异步搜索。

**Tech Stack:** NestJS 12 + `@nestjs/axios` + `@nestjs/cache-manager` + `@nestjs/throttler`(后端,ESM);Vue 3 `<script setup>` + Pinia + 原生 CSS(前端);两端都用 Vitest。

## Global Constraints

- **设计依据:** `docs/superpowers/specs/2026-09-03-geo-location-name-design.md`。本计划与该 spec 冲突时以 spec 为准。
- **后端是 ESM**(`"type": "module"`):所有相对导入**必须带 `.js` 扩展名**,哪怕源文件是 `.ts`。例:`import { GeoService } from './geo.service.js'`。
- **前端类型与后端契约手动同步**:两个项目不共享 npm 包。改后端契约必须同步改 `frontend/src/types/`,没有任何自动检查会提醒。
- **GeoAPI 必须用专属 API Host**:`https://${QWEATHER_API_HOST}/geo/v2/...`。公共域名 `geoapi.qweather.com` 实测返回 404。认证走请求头 `X-QW-Api-Key`,与天气接口相同。
- **前端不得直连和风 GeoAPI**:API Key 不能出现在浏览器里,一律走后端代理。
- **上游失败原因只进服务端日志**,给浏览器的错误信息不得包含上游原始文本。
- **测试文件命名**:`*.spec.ts` 会被 `npm test` 跑到;`*.e2e-spec.ts` 只被 `npm run test:e2e` 跑。本计划的 e2e 契约测试沿用 `*.e2e.spec.ts`(和 `weather.e2e.spec.ts` 一致,进 `npm test`)。
- **提交信息署名**:`Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`
- **每个任务结束时**后端跑 `cd backend && npm test`、前端跑 `cd frontend && npm test`,必须全绿再提交。

---

### Task 1: Geo 归一化类型与 QWeatherGeoProvider

**Files:**
- Create: `backend/src/geo/interfaces/geo.interfaces.ts`
- Create: `backend/src/geo/providers/qweather-geo.provider.ts`
- Test: `backend/src/geo/providers/qweather-geo.provider.spec.ts`

**Interfaces:**
- Produces:
  - `NormalizedLocation { id: string; name: string; adm1: string; adm2: string; lat: number; lon: number }`
  - `QWeatherGeoProvider` 类,三个方法:
    - `reverse(lat: number, lon: number): Promise<NormalizedLocation | null>`
    - `search(q: string): Promise<NormalizedLocation[]>`
    - `top(): Promise<NormalizedLocation[]>`
  - `describeGeoUpstreamError(error: unknown): string`
  - 供 Task 2 `GeoService`、Task 3 `GeoModule` 使用

- [ ] **Step 1: 写归一化类型**

```typescript
// backend/src/geo/interfaces/geo.interfaces.ts
export interface NormalizedLocation {
  /** 和风 Location ID,如 "101011600" */
  id: string;
  /** 地点名,直辖市反查出来是区级,如 "东城" */
  name: string;
  /** 省级行政区,如 "北京市" */
  adm1: string;
  /** 市级行政区,如 "北京"。地级市自身的 name 与 adm2 会重复(厦门/厦门) */
  adm2: string;
  /** 和风返回的是字符串,这里统一转成 number */
  lat: number;
  lon: number;
}
```

- [ ] **Step 2: 写失败测试**

```typescript
// backend/src/geo/providers/qweather-geo.provider.spec.ts
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { QWeatherGeoProvider } from './qweather-geo.provider.js';

function buildProvider(getImpl: Mock) {
  const httpService = { get: getImpl } as any;
  const configService = {
    get: (key: string) => (key === 'qweather.apiHost' ? 'test.qweatherapi.com' : 'test-key'),
  } as any;
  return new QWeatherGeoProvider(httpService, configService);
}

// 和风 GeoAPI 实测返回的字段形状(2026-09-03,坐标 116.4074,39.9042)
const beijingDongcheng = {
  name: '东城',
  id: '101011600',
  lat: '39.91755',
  lon: '116.41876',
  adm2: '北京',
  adm1: '北京市',
  country: '中国',
  tz: 'Asia/Shanghai',
  type: 'city',
  rank: '35',
};

describe('QWeatherGeoProvider.reverse', () => {
  it('把坐标反查结果归一化,并把字符串经纬度转成 number', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '200', location: [beijingDongcheng] } }));

    const provider = buildProvider(getImpl);
    const result = await provider.reverse(39.9042, 116.4074);

    expect(result).toEqual({
      id: '101011600',
      name: '东城',
      adm1: '北京市',
      adm2: '北京',
      lat: 39.91755,
      lon: 116.41876,
    });
    // 请求要打专属 API Host,经度在前纬度在后
    const [url, config] = getImpl.mock.calls[0];
    expect(url).toBe('https://test.qweatherapi.com/geo/v2/city/lookup');
    expect(config.params.location).toBe('116.4074,39.9042');
    expect(config.headers['X-QW-Api-Key']).toBe('test-key');
  });

  it('上游 code 404(无匹配结果)返回 null,而不是抛错', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '404' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.reverse(0, 0)).resolves.toBeNull();
  });

  it('上游 code 非 200 也非 404 时抛错,把 code 带进错误信息', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '403' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.reverse(39.9, 116.4)).rejects.toThrow(/403/);
  });
});

describe('QWeatherGeoProvider.search', () => {
  it('返回归一化后的多个候选,保留上游顺序', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({
        data: {
          code: '200',
          location: [
            { ...beijingDongcheng, name: '朝阳', id: '101071201', adm2: '朝阳', adm1: '辽宁省' },
            { ...beijingDongcheng, name: '朝阳', id: '101010300', adm2: '北京', adm1: '北京市' },
          ],
        },
      }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.search('朝阳');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: '朝阳', adm1: '辽宁省' });
    expect(result[1]).toMatchObject({ name: '朝阳', adm1: '北京市' });
    const [url, config] = getImpl.mock.calls[0];
    expect(url).toBe('https://test.qweatherapi.com/geo/v2/city/lookup');
    expect(config.params).toMatchObject({ location: '朝阳', number: 10 });
  });

  it('无匹配结果时返回空数组', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '404' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.search('不存在的地方')).resolves.toEqual([]);
  });
});

describe('QWeatherGeoProvider.top', () => {
  it('读的是 topCityList 字段,不是 location', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({ data: { code: '200', topCityList: [{ ...beijingDongcheng, name: '北京', id: '101010100' }] } }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.top();

    expect(result).toEqual([
      { id: '101010100', name: '北京', adm1: '北京市', adm2: '北京', lat: 39.91755, lon: 116.41876 },
    ]);
    const [url, config] = getImpl.mock.calls[0];
    expect(url).toBe('https://test.qweatherapi.com/geo/v2/city/top');
    expect(config.params).toMatchObject({ range: 'cn', number: 20 });
  });
});

describe('QWeatherGeoProvider 上游错误原因提取', () => {
  it('把 HTTP 错误响应体里的可读原因带进错误信息', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401, data: { error: { title: 'Unauthorized', detail: 'API key is invalid' } } },
    });
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => axiosError));

    const provider = buildProvider(getImpl);

    await expect(provider.search('北京')).rejects.toThrow(/API key is invalid/);
  });

  it('没有可读原因时保留 axios 原始信息,不吞掉', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => new Error('network timeout')));

    const provider = buildProvider(getImpl);

    await expect(provider.search('北京')).rejects.toThrow(/network timeout/);
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd backend && npx vitest run src/geo/providers/qweather-geo.provider.spec.ts
```

预期:模块不存在,报错失败。

- [ ] **Step 4: 实现 Provider**

```typescript
// backend/src/geo/providers/qweather-geo.provider.ts
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { NormalizedLocation } from '../interfaces/geo.interfaces.js';

interface QWeatherGeoRawLocation {
  id: string;
  name: string;
  adm1: string;
  adm2: string;
  lat: string;
  lon: string;
}

interface QWeatherGeoResponse {
  code: string;
  location?: QWeatherGeoRawLocation[];
  topCityList?: QWeatherGeoRawLocation[];
}

// 和风用 Error Code v2:失败时 body 形如 { error: { status, title, detail } }。
// axios 的 message 只有 "Request failed with status code 401",会丢掉 detail 里
// 那句真正有用的说明。与 qweather.provider.ts / caiyun.provider.ts 的做法保持一致。
export function describeGeoUpstreamError(error: unknown): string {
  const detail = (error as { response?: { data?: { error?: { title?: string; detail?: string } } } })?.response
    ?.data?.error;
  if (detail?.title) {
    return detail.detail ? `${detail.title}: ${detail.detail}` : detail.title;
  }
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class QWeatherGeoProvider {
  private readonly apiHost: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiHost = this.configService.get<string>('qweather.apiHost') ?? '';
    this.apiKey = this.configService.get<string>('qweather.apiKey') ?? '';
  }

  async reverse(lat: number, lon: number): Promise<NormalizedLocation | null> {
    // 和风的坐标参数是「经度,纬度」,与响应体里的顺序相反
    const list = await this.request('/geo/v2/city/lookup', { location: `${lon},${lat}` }, 'location');
    return list.length > 0 ? list[0] : null;
  }

  async search(q: string): Promise<NormalizedLocation[]> {
    return this.request('/geo/v2/city/lookup', { location: q, number: 10 }, 'location');
  }

  async top(): Promise<NormalizedLocation[]> {
    return this.request('/geo/v2/city/top', { range: 'cn', number: 20 }, 'topCityList');
  }

  private async request(
    path: string,
    params: Record<string, string | number>,
    field: 'location' | 'topCityList',
  ): Promise<NormalizedLocation[]> {
    let response;
    try {
      response = await firstValueFrom(
        this.httpService.get<QWeatherGeoResponse>(`https://${this.apiHost}${path}`, {
          params,
          headers: { 'X-QW-Api-Key': this.apiKey },
          timeout: 8000,
        }),
      );
    } catch (error) {
      throw new Error(`和风地理接口请求失败: ${describeGeoUpstreamError(error)}`);
    }

    const body = response.data;
    // 404 是"查无此地",属于有效结果而不是故障 —— 上层会把它当成空结果缓存起来
    // （2026-09-03 实测确认这个假设是错的:和风实际返回 HTTP 400 + error.type 含
    // no-such-location,axios 遇 4xx 直接抛,这个分支永远不会命中。见 Task 9 修复。）
    if (body?.code === '404') {
      return [];
    }
    if (body?.code !== '200') {
      throw new Error(`和风地理接口返回异常: code=${body?.code ?? 'unknown'}`);
    }

    return (body[field] ?? []).map(
      (raw): NormalizedLocation => ({
        id: raw.id,
        name: raw.name,
        adm1: raw.adm1,
        adm2: raw.adm2,
        lat: Number(raw.lat),
        lon: Number(raw.lon),
      }),
    );
  }
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd backend && npx vitest run src/geo/providers/qweather-geo.provider.spec.ts
```

预期:PASS(8 个用例)

- [ ] **Step 6: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add backend/src/geo
git commit -m "$(cat <<'EOF'
Add QWeatherGeoProvider for coordinate lookup, search and top cities

一个接口两用:传坐标是反查,传关键词是搜索。"查无此地"按有效的空结果处理而不是
故障 —— 上层会把它缓存起来,避免同一个无效关键词反复打上游。

（注:本任务最初假设"查无此地"是 200 + code: "404",2026-09-03 用真实凭据实测发现这是错的,
实际是 HTTP 400 + error.type 含 no-such-location,见 Task 9 修复及其提交记录。）

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 2: GeoService(缓存层)

**Files:**
- Create: `backend/src/geo/geo.service.ts`
- Test: `backend/src/geo/geo.service.spec.ts`

**Interfaces:**
- Consumes:`QWeatherGeoProvider`、`NormalizedLocation`(Task 1)
- Produces:`GeoService`,三个方法签名与 Provider 相同(`reverse` / `search` / `top`),供 Task 3 `GeoController` 使用

**这个任务的核心是两条缓存规则**,实现时不要简化掉:

1. **失败一律不写缓存。** geo 的 TTL 是 24 小时,一旦把失败结果缓存进去,一次瞬时抖动会被固化一整天。这与天气侧相反(天气用 60 秒的短 TTL 挡住故障期重复重试,那是建立在 TTL 只有 30 分钟的前提上)。
2. **空结果要缓存。** `reverse` 的 `null` 和 `search` 的 `[]` 是有效结果("查无此地"),缓存它们能避免同一个无效关键词反复打上游。（Task 1 最初假设"查无此地"是上游 code 404;2026-09-03 实测确认这个假设是错的,实际是 HTTP 400 + error.type 含 no-such-location,见 Task 9。）

因为要缓存 `null`,缓存值必须**包一层** `{ value: ... }`。否则无法区分"缓存里存的是 null"和"缓存未命中"——`cache.get()` 未命中返回的就是 `undefined`/`null`。

- [ ] **Step 1: 写失败测试**

```typescript
// backend/src/geo/geo.service.spec.ts
import { GeoService } from './geo.service.js';
import type { NormalizedLocation } from './interfaces/geo.interfaces.js';

const dongcheng: NormalizedLocation = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

function buildService(provider: Partial<Record<'reverse' | 'search' | 'top', any>>) {
  const store = new Map<string, unknown>();
  const cache = {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  } as any;
  const configService = { get: () => 86400 } as any;
  const service = new GeoService(provider as any, cache, configService);
  return { service, cache, store };
}

describe('GeoService.reverse', () => {
  it('第一次打上游,第二次命中缓存', async () => {
    const reverse = vi.fn().mockResolvedValue(dongcheng);
    const { service } = buildService({ reverse });

    await expect(service.reverse(39.9042, 116.4074)).resolves.toEqual(dongcheng);
    await expect(service.reverse(39.9042, 116.4074)).resolves.toEqual(dongcheng);

    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it('坐标取两位小数,微小抖动命中同一份缓存', async () => {
    const reverse = vi.fn().mockResolvedValue(dongcheng);
    const { service } = buildService({ reverse });

    await service.reverse(39.9042, 116.4074);
    await service.reverse(39.9041, 116.40739);

    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it('null 是有效结果,要缓存,不能每次都回源', async () => {
    const reverse = vi.fn().mockResolvedValue(null);
    const { service } = buildService({ reverse });

    await expect(service.reverse(0, 0)).resolves.toBeNull();
    await expect(service.reverse(0, 0)).resolves.toBeNull();

    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it('上游失败不写缓存,下次仍然回源(24 小时 TTL 下不能固化一次抖动)', async () => {
    const reverse = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(dongcheng);
    const { service, cache } = buildService({ reverse });

    await expect(service.reverse(39.9042, 116.4074)).rejects.toThrow('boom');
    expect(cache.set).not.toHaveBeenCalled();

    await expect(service.reverse(39.9042, 116.4074)).resolves.toEqual(dongcheng);
    expect(reverse).toHaveBeenCalledTimes(2);
  });
});

describe('GeoService.search', () => {
  it('按关键词缓存,大小写和首尾空格归一到同一个 key', async () => {
    const search = vi.fn().mockResolvedValue([dongcheng]);
    const { service } = buildService({ search });

    await service.search('Xiamen');
    await service.search('  xiamen  ');

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('空数组是有效结果,要缓存', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { service } = buildService({ search });

    await expect(service.search('不存在的地方')).resolves.toEqual([]);
    await expect(service.search('不存在的地方')).resolves.toEqual([]);

    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe('GeoService.top', () => {
  it('缓存热门城市', async () => {
    const top = vi.fn().mockResolvedValue([dongcheng]);
    const { service } = buildService({ top });

    await service.top();
    await service.top();

    expect(top).toHaveBeenCalledTimes(1);
  });
});

describe('GeoService 缓存 key 互不串扰', () => {
  it('reverse / search / top 各用各的 key', async () => {
    const provider = {
      reverse: vi.fn().mockResolvedValue(dongcheng),
      search: vi.fn().mockResolvedValue([]),
      top: vi.fn().mockResolvedValue([dongcheng]),
    };
    const { service, store } = buildService(provider);

    await service.reverse(39.9042, 116.4074);
    await service.search('北京');
    await service.top();

    expect([...store.keys()].sort()).toEqual(['geo:q:北京', 'geo:rev:39.90:116.41', 'geo:top']);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd backend && npx vitest run src/geo/geo.service.spec.ts
```

预期:模块不存在,报错失败。

- [ ] **Step 3: 实现 GeoService**

```typescript
// backend/src/geo/geo.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { QWeatherGeoProvider } from './providers/qweather-geo.provider.js';
import { NormalizedLocation } from './interfaces/geo.interfaces.js';

// 缓存值统一包一层。因为 reverse 的有效结果可能就是 null,不包的话无法区分
// "缓存里存的是 null" 和 "缓存未命中"(cache.get 未命中返回的就是 undefined)
interface CacheEnvelope<T> {
  value: T;
}

@Injectable()
export class GeoService {
  constructor(
    private readonly provider: QWeatherGeoProvider,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
  ) {}

  async reverse(lat: number, lon: number): Promise<NormalizedLocation | null> {
    // 与天气侧一致:坐标四舍五入到两位小数(约 1.1km),抵消 GPS 抖动
    return this.cached(`geo:rev:${lat.toFixed(2)}:${lon.toFixed(2)}`, () => this.provider.reverse(lat, lon));
  }

  async search(q: string): Promise<NormalizedLocation[]> {
    // 转小写让拼音搜索(Xiamen / xiamen)命中同一份缓存;中文不受影响
    const normalized = q.trim().toLowerCase();
    return this.cached(`geo:q:${normalized}`, () => this.provider.search(q.trim()));
  }

  async top(): Promise<NormalizedLocation[]> {
    return this.cached('geo:top', () => this.provider.top());
  }

  private async cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const hit = await this.cache.get<CacheEnvelope<T>>(key);
    if (hit) {
      return hit.value;
    }

    // 注意:失败时直接向上抛,不写缓存。geo 的 TTL 是 24 小时,缓存住一次瞬时
    // 抖动会把故障固化一整天。空结果(null / [])则是有效结果,照常缓存
    const value = await load();
    const ttlSeconds = this.configService.get<number>('geo.cacheTtlSeconds') ?? 86400;
    await this.cache.set(key, { value }, ttlSeconds * 1000);
    return value;
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd backend && npx vitest run src/geo/geo.service.spec.ts
```

预期:PASS(8 个用例)

- [ ] **Step 5: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add backend/src/geo/geo.service.ts backend/src/geo/geo.service.spec.ts
git commit -m "$(cat <<'EOF'
Add GeoService with a 24h cache that never caches failures

两条规则:失败一律不写缓存(24 小时 TTL 会把一次瞬时抖动固化一整天),空结果
照常缓存(避免同一个无效关键词反复打上游)。因为要缓存 null,缓存值包了一层
{ value },否则无法区分"存的是 null"和"未命中"。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 3: 路由、DTO、模块接线与独立限流

**Files:**
- Create: `backend/src/geo/dto/geo-reverse-query.dto.ts`
- Create: `backend/src/geo/dto/geo-search-query.dto.ts`
- Create: `backend/src/geo/geo.controller.ts`
- Create: `backend/src/geo/geo.module.ts`
- Test: `backend/src/geo/geo.controller.spec.ts`
- Modify: `backend/src/config/configuration.ts`(新增 `geo` 段)
- Modify: `backend/src/app.module.ts`(具名限流器 + 引入 `GeoModule`)
- Modify: `backend/src/weather/weather.controller.ts`(跳过 geo 限流器)
- Modify: `backend/.env.example`
- Modify: `backend/README.md`

**Interfaces:**
- Consumes:`GeoService`(Task 2)、`NormalizedLocation`(Task 1)
- Produces:三个 HTTP 路由,供 Task 4 e2e 测试与 Task 6 前端 API 层使用:
  - `GET /geo/reverse?lat=&lon=` → `{ location: NormalizedLocation | null }`
  - `GET /geo/search?q=` → `{ locations: NormalizedLocation[] }`
  - `GET /geo/top` → `{ locations: NormalizedLocation[] }`

**限流为什么要具名:** `@Throttle()` 装饰器的参数是静态的,读不到 `ConfigService`。`@nestjs/throttler` v6 支持在 `forRootAsync` 里配置**多个具名限流器**,所有路由默认同时受全部限流器约束,再用 `@SkipThrottle({ name: true })` 让每个 controller 只受自己那个约束。搜索比查天气频繁得多,共用 30 次/分钟会让用户搜几次城市后刷新天气就撞 429 —— 而那个失败看起来像天气服务挂了,会把排查方向带偏。

- [ ] **Step 1: 在配置里新增 geo 段**

```typescript
// backend/src/config/configuration.ts —— 在 throttle 段之后追加
  geo: {
    // 地理数据几乎不变,TTL 开得比天气长得多(天气是 1800)
    cacheTtlSeconds: parseInt(process.env.GEO_CACHE_TTL_SECONDS ?? '86400', 10),
    throttleTtlMs: parseInt(process.env.GEO_THROTTLE_TTL_MS ?? '60000', 10),
    // 注意:@nestjs/throttler 的限流 key 按 ClassName-HandlerName-limiterName-ip 生成,
    // 是 per-route 的 —— 这个值是 /geo/reverse、/geo/search、/geo/top 各自的额度,
    // 三个路由合计是它的 3 倍。默认 20 即合计 60/min/IP,对应原本的限流意图。
    throttleLimit: parseInt(process.env.GEO_THROTTLE_LIMIT ?? '20', 10),
  },
```

- [ ] **Step 2: 写两个 DTO**

```typescript
// backend/src/geo/dto/geo-reverse-query.dto.ts
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

export class GeoReverseQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}
```

```typescript
// backend/src/geo/dto/geo-search-query.dto.ts
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString } from 'class-validator';

export class GeoSearchQueryDto {
  // 不设最小长度:单字搜索("北")是有效需求,和风自己会按 rank 排序返回最相关的结果
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  q: string;
}
```

- [ ] **Step 3: 写 controller 的失败测试**

```typescript
// backend/src/geo/geo.controller.spec.ts
import { GeoController } from './geo.controller.js';
import type { NormalizedLocation } from './interfaces/geo.interfaces.js';

const dongcheng: NormalizedLocation = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

describe('GeoController', () => {
  it('reverse 成功时包在 location 字段里返回', async () => {
    const service = { reverse: vi.fn().mockResolvedValue(dongcheng) } as any;
    const controller = new GeoController(service);

    await expect(controller.reverse({ lat: 39.9042, lon: 116.4074 })).resolves.toEqual({
      location: dongcheng,
    });
  });

  it('reverse 遇到上游失败时吞掉异常返回 null —— 用户没主动要地名,不该为它报错', async () => {
    const service = { reverse: vi.fn().mockRejectedValue(new Error('upstream down')) } as any;
    const controller = new GeoController(service);

    await expect(controller.reverse({ lat: 39.9042, lon: 116.4074 })).resolves.toEqual({ location: null });
  });

  it('search 失败时向上抛 —— 用户主动发起的操作必须有反馈', async () => {
    const service = { search: vi.fn().mockRejectedValue(new Error('upstream down')) } as any;
    const controller = new GeoController(service);

    await expect(controller.search({ q: '北京' })).rejects.toThrow();
  });

  it('top 失败时吞掉异常返回空数组 —— 空状态的锦上添花', async () => {
    const service = { top: vi.fn().mockRejectedValue(new Error('upstream down')) } as any;
    const controller = new GeoController(service);

    await expect(controller.top()).resolves.toEqual({ locations: [] });
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

```bash
cd backend && npx vitest run src/geo/geo.controller.spec.ts
```

预期:模块不存在,报错失败。

- [ ] **Step 5: 实现 controller**

```typescript
// backend/src/geo/geo.controller.ts
import { Controller, Get, Logger, Query, ValidationPipe } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { GeoService } from './geo.service.js';
import { GeoReverseQueryDto } from './dto/geo-reverse-query.dto.js';
import { GeoSearchQueryDto } from './dto/geo-search-query.dto.js';
import { NormalizedLocation } from './interfaces/geo.interfaces.js';

// 只受 geo 限流器约束。搜索比查天气频繁得多,共用一份额度会让用户搜几次城市后
// 刷新天气就撞 429 —— 而那个失败看起来像天气服务挂了
@SkipThrottle({ default: true })
@Controller('geo')
export class GeoController {
  private readonly logger = new Logger(GeoController.name);

  constructor(private readonly geoService: GeoService) {}

  // 三个路由的失败行为刻意不对称,见 spec"三个路由的失败行为刻意不对称"一节:
  // 用户没主动索取地名,不该为它弹错误 —— 失败静默返回 null,前端回落到"当前位置"
  @Get('reverse')
  async reverse(
    @Query(new ValidationPipe({ transform: true })) query: GeoReverseQueryDto,
  ): Promise<{ location: NormalizedLocation | null }> {
    try {
      return { location: await this.geoService.reverse(query.lat, query.lon) };
    } catch (error) {
      this.logger.warn(`地名反查失败: ${error instanceof Error ? error.message : String(error)}`);
      return { location: null };
    }
  }

  // 用户主动发起,必须有反馈 —— 失败向上抛,由 Nest 转成 500。
  // 详细原因只进服务端日志,不透传给浏览器
  @Get('search')
  async search(
    @Query(new ValidationPipe({ transform: true })) query: GeoSearchQueryDto,
  ): Promise<{ locations: NormalizedLocation[] }> {
    return { locations: await this.geoService.search(query.q) };
  }

  // 空状态的锦上添花,失败退回空数组,前端照常显示提示文案
  @Get('top')
  async top(): Promise<{ locations: NormalizedLocation[] }> {
    try {
      return { locations: await this.geoService.top() };
    } catch (error) {
      this.logger.warn(`热门城市获取失败: ${error instanceof Error ? error.message : String(error)}`);
      return { locations: [] };
    }
  }
}
```

- [ ] **Step 6: 写模块**

```typescript
// backend/src/geo/geo.module.ts
import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GeoController } from './geo.controller.js';
import { GeoService } from './geo.service.js';
import { QWeatherGeoProvider } from './providers/qweather-geo.provider.js';

@Module({
  imports: [HttpModule],
  controllers: [GeoController],
  providers: [GeoService, QWeatherGeoProvider],
})
export class GeoModule {}
```

- [ ] **Step 7: 在 app.module.ts 里配置具名限流器并引入 GeoModule**

`ThrottlerModule.forRootAsync` 的 `useFactory` 返回值改成两个具名限流器:

```typescript
    ThrottlerModule.forRootAsync({
      imports: [],
      useFactory: (configService: ConfigService) => [
        // 具名限流器:所有路由默认同时受两者约束,各 controller 再用 @SkipThrottle
        // 跳过不属于自己的那个。@Throttle 装饰器参数是静态的、读不到 ConfigService,
        // 所以额度只能在这里配
        {
          name: 'default',
          ttl: configService.get<number>('throttle.ttlMs')!,
          limit: configService.get<number>('throttle.limit')!,
        },
        {
          name: 'geo',
          ttl: configService.get<number>('geo.throttleTtlMs')!,
          limit: configService.get<number>('geo.throttleLimit')!,
        },
      ],
      inject: [ConfigService],
    }),
```

`imports` 数组里在 `WeatherModule` 之后加上 `GeoModule`,并在文件顶部加:

```typescript
import { GeoModule } from './geo/geo.module.js';
```

- [ ] **Step 8: 让 WeatherController 跳过 geo 限流器**

在 `backend/src/weather/weather.controller.ts` 的 `@Controller('weather')` 之上加一行,并补 import:

```typescript
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle({ geo: true })
@Controller('weather')
```

- [ ] **Step 9: 运行测试确认通过**

```bash
cd backend && npm test
```

预期:全部 PASS(原有 35 个 + 本任务新增,包含 Task 1、2 的用例)

- [ ] **Step 10: 更新 .env.example**

在 `backend/.env.example` 末尾追加:

```
# 地理接口(和风 GeoAPI,复用上面的 QWEATHER_API_HOST / QWEATHER_API_KEY)
# 地理数据几乎不变,TTL 比天气长得多
GEO_CACHE_TTL_SECONDS=86400
# geo 路由独立的限流额度,不与 /weather 抢同一份。
# 注意这是「每个路由各自的额度」,三个路由合计是它的 3 倍
GEO_THROTTLE_TTL_MS=60000
GEO_THROTTLE_LIMIT=20
```

- [ ] **Step 11: 更新 README**

在 `backend/README.md` 的「环境变量」表格末尾追加三行:

```markdown
| `GEO_CACHE_TTL_SECONDS` | 地理接口缓存 TTL(秒)。地理数据几乎不变,开得比天气长得多 | `86400` | 否 |
| `GEO_THROTTLE_TTL_MS` | 地理接口限流统计窗口(毫秒) | `60000` | 否 |
| `GEO_THROTTLE_LIMIT` | **每个 geo 路由**每窗口每 IP 的请求数(`@nestjs/throttler` 的限流 key 是 per-handler 的,三个路由合计为此值的 3 倍)。与 `/weather` 的额度相互独立 | `20` | 否 |
```

再在「API」一节末尾追加:

````markdown
### `GET /geo/reverse?lat=<纬度>&lon=<经度>`

坐标反查地名。响应 `200`:

```json
{ "location": { "id": "101011600", "name": "东城", "adm1": "北京市", "adm2": "北京", "lat": 39.91755, "lon": 116.41876 } }
```

查不到或上游失败时 `location` 为 `null`,**仍返回 `200`** —— 地名是锦上添花,不该为它让前端进错误分支。

### `GET /geo/search?q=<关键词>`

按关键词搜索城市,支持中文与拼音,返回最多 10 条。响应 `200`:`{ "locations": [ ... ] }`。

`q` 为空返回 `400`。**上游失败返回 `5xx`** —— 这是用户主动发起的操作,必须有反馈。

### `GET /geo/top`

热门城市(中国,最多 20 条),供搜索框空状态使用。上游失败时返回 `200` + 空数组。

三个路由复用 `QWEATHER_API_HOST` / `QWEATHER_API_KEY`,走独立的限流额度(`GEO_THROTTLE_LIMIT`),缓存 TTL 由 `GEO_CACHE_TTL_SECONDS` 控制。**失败结果一律不缓存**,避免 24 小时的 TTL 把一次瞬时故障固化一整天。
````

- [ ] **Step 12: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add backend/src/geo backend/src/config/configuration.ts backend/src/app.module.ts \
        backend/src/weather/weather.controller.ts backend/.env.example backend/README.md
git commit -m "$(cat <<'EOF'
Expose /geo/reverse, /geo/search and /geo/top with their own rate limit

三个路由的失败行为刻意不对称:reverse 静默返回 null(用户没主动要地名),
search 向上抛 5xx(主动操作必须有反馈),top 返回空数组(锦上添花)。

限流用具名限流器:@Throttle 装饰器参数是静态的读不到 ConfigService,所以在
forRootAsync 里配 default 和 geo 两个,各 controller 用 @SkipThrottle 跳过不属于
自己的那个。搜索比查天气频繁得多,共用额度会让用户搜几次城市后刷新天气就撞 429,
而那个失败看起来像天气服务挂了。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 4: e2e 契约测试

**Files:**
- Test: `backend/src/geo/geo.e2e.spec.ts`

**Interfaces:**
- Consumes:Task 3 的三个路由
- Produces:锁定契约的 HTTP 层测试。前端(Task 6-8)照着这个形状写代码

**为什么单开一个任务:** `geo.controller.spec.ts` 直接调用 controller 方法,传进去的已经是合法对象,覆盖不到 DTO 的 query string 转换和校验。这里走真实 HTTP(supertest),覆盖:参数缺失/非法是否真返回 `400`、`lat`/`lon` 的字符串能否转成数字、响应体形状、以及那组不对称的失败行为。做法与 `weather.e2e.spec.ts` 一致 —— 用 `.overrideProvider()` 换掉真实 provider,不打第三方 API,因此不需要 `.env` 里的真实凭据。

- [ ] **Step 1: 写 e2e 测试**

```typescript
// backend/src/geo/geo.e2e.spec.ts
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module.js';
import { QWeatherGeoProvider } from './providers/qweather-geo.provider.js';
import type { NormalizedLocation } from './interfaces/geo.interfaces.js';

// 端到端契约测试:真正走 HTTP 层,覆盖 controller.spec 覆盖不到的 DTO 转换与校验。
// 用 .overrideProvider(QWeatherGeoProvider) 换成假 provider,不会真的打和风 API,
// 所以不需要 backend/.env 里的真实凭据。

const dongcheng: NormalizedLocation = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

describe('GET /geo (e2e)', () => {
  let app: INestApplication<App>;
  let fakeProvider: {
    reverse: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    top: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    fakeProvider = {
      reverse: vi.fn().mockResolvedValue(dongcheng),
      search: vi.fn().mockResolvedValue([dongcheng]),
      top: vi.fn().mockResolvedValue([dongcheng]),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QWeatherGeoProvider)
      .useValue(fakeProvider)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reverse 把 query string 里的字符串坐标转成数字并返回地点', async () => {
    const response = await request(app.getHttpServer()).get('/geo/reverse?lat=39.9042&lon=116.4074').expect(200);

    expect(response.body).toEqual({ location: dongcheng });
    // DTO 必须把字符串转成 number,否则 provider 拿到的是 "39.9042"
    expect(fakeProvider.reverse).toHaveBeenCalledWith(39.9042, 116.4074);
  });

  it('reverse 缺参数返回 400', async () => {
    await request(app.getHttpServer()).get('/geo/reverse?lat=39.9042').expect(400);
  });

  it('reverse 坐标非法返回 400', async () => {
    await request(app.getHttpServer()).get('/geo/reverse?lat=999&lon=116.4074').expect(400);
  });

  it('reverse 在上游失败时仍返回 200 + location:null,不让前端进错误分支', async () => {
    fakeProvider.reverse.mockRejectedValue(new Error('upstream down'));

    const response = await request(app.getHttpServer()).get('/geo/reverse?lat=39.9042&lon=116.4074').expect(200);

    expect(response.body).toEqual({ location: null });
  });

  it('search 返回候选列表', async () => {
    const response = await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97%E4%BA%AC').expect(200);

    expect(response.body).toEqual({ locations: [dongcheng] });
    expect(fakeProvider.search).toHaveBeenCalledWith('北京');
  });

  it('search 单字关键词是有效请求,不设最小长度门槛', async () => {
    await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97').expect(200);

    expect(fakeProvider.search).toHaveBeenCalledWith('北');
  });

  it('search 缺 q 或 q 为空白返回 400', async () => {
    await request(app.getHttpServer()).get('/geo/search').expect(400);
    await request(app.getHttpServer()).get('/geo/search?q=%20%20').expect(400);
  });

  it('search 在上游失败时返回 5xx —— 用户主动发起的操作必须有反馈', async () => {
    fakeProvider.search.mockRejectedValue(new Error('upstream down'));

    await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97%E4%BA%AC').expect(500);
  });

  it('search 的错误响应体不含上游原始文本', async () => {
    fakeProvider.search.mockRejectedValue(new Error('API key is invalid: secret-token-leaked'));

    const response = await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97%E4%BA%AC').expect(500);

    expect(JSON.stringify(response.body)).not.toContain('secret-token-leaked');
  });

  it('top 返回热门城市', async () => {
    const response = await request(app.getHttpServer()).get('/geo/top').expect(200);

    expect(response.body).toEqual({ locations: [dongcheng] });
  });

  it('top 在上游失败时返回 200 + 空数组', async () => {
    fakeProvider.top.mockRejectedValue(new Error('upstream down'));

    const response = await request(app.getHttpServer()).get('/geo/top').expect(200);

    expect(response.body).toEqual({ locations: [] });
  });
});
```

- [ ] **Step 2: 运行测试**

```bash
cd backend && npx vitest run src/geo/geo.e2e.spec.ts
```

预期:全部 PASS。若 `search` 的 500 用例失败,检查 Task 3 Step 5 里 `search` 方法是否**没有** try/catch(它应该向上抛);若 `reverse` 的 200 用例失败,检查 `reverse` 是否**有** try/catch。

- [ ] **Step 3: 跑一次全量测试确认没有回归**

```bash
cd backend && npm test && npm run build
```

预期:全部 PASS,构建干净。

- [ ] **Step 4: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add backend/src/geo/geo.e2e.spec.ts
git commit -m "$(cat <<'EOF'
Add an HTTP-level e2e test locking down the /geo contract

覆盖 controller.spec 覆盖不到的部分:query string 的字符串坐标能否转成数字、
参数缺失/非法是否真返回 400、以及那组不对称的失败行为(reverse 200+null /
search 5xx / top 200+[])。另有一条断言错误响应体不含上游原始文本。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 前端地名显示规则(纯函数)

**Files:**
- Create: `frontend/src/types/location.ts`
- Create: `frontend/src/utils/location-display.ts`
- Test: `frontend/src/utils/location-display.spec.ts`

**Interfaces:**
- Produces:
  - `NormalizedLocation`(与后端 `backend/src/geo/interfaces/geo.interfaces.ts` 字段一致,手动同步)
  - `formatLocationName(location: NormalizedLocation | null): string` —— 供 Task 7 `App.vue` 与 Task 8 `CitySearch.vue` 共用

- [ ] **Step 1: 写类型(无独立测试,在下一步被消费验证)**

```typescript
// frontend/src/types/location.ts
/** 与后端 backend/src/geo/interfaces/geo.interfaces.ts 保持一致,手动同步 */
export interface NormalizedLocation {
  id: string;
  name: string;
  /** 省级,如 "北京市" */
  adm1: string;
  /** 市级,如 "北京" */
  adm2: string;
  lat: number;
  lon: number;
}
```

- [ ] **Step 2: 写失败测试**

```typescript
// frontend/src/utils/location-display.spec.ts
import { formatLocationName } from './location-display';
import type { NormalizedLocation } from '../types/location';

const loc = (over: Partial<NormalizedLocation>): NormalizedLocation => ({
  id: '1',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.9,
  lon: 116.4,
  ...over,
});

describe('formatLocationName', () => {
  it('地级市自身的 name 与 adm2 重复时只显示一个', () => {
    // 实测:搜索「厦门」返回 name="厦门" adm2="厦门",拼接会得到"厦门 厦门"
    expect(formatLocationName(loc({ name: '厦门', adm2: '厦门', adm1: '福建省' }))).toBe('厦门');
  });

  it('直辖市反查到区级时显示「市·区」', () => {
    expect(formatLocationName(loc({ name: '东城', adm2: '北京' }))).toBe('北京·东城');
    expect(formatLocationName(loc({ name: '海淀', adm2: '北京' }))).toBe('北京·海淀');
  });

  it('同名地点靠上级城市区分', () => {
    expect(formatLocationName(loc({ name: '朝阳', adm2: '朝阳', adm1: '辽宁省' }))).toBe('朝阳');
    expect(formatLocationName(loc({ name: '朝阳', adm2: '北京', adm1: '北京市' }))).toBe('北京·朝阳');
  });

  it('没有地名时回落到「当前位置」,而不是空字符串或 undefined', () => {
    expect(formatLocationName(null)).toBe('当前位置');
  });

  it('adm2 缺失时只显示 name,不会渲染出多余的分隔符', () => {
    expect(formatLocationName(loc({ name: '东城', adm2: '' }))).toBe('东城');
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd frontend && npm test -- src/utils/location-display.spec.ts
```

预期:模块不存在,报错失败。

- [ ] **Step 4: 实现**

```typescript
// frontend/src/utils/location-display.ts
import type { NormalizedLocation } from '../types/location';

/**
 * 把地点格式化成标题用的短名。
 *
 * 两个坑都来自实测:直辖市反查出来是区级("东城"而非"北京"),而地级市自身的
 * name 与 adm2 是重复的("厦门"/"厦门"),无脑拼接会得到"厦门 厦门"。
 *
 * 顶部标题和搜索结果列表共用这个函数,保证两处显示一致。
 */
export function formatLocationName(location: NormalizedLocation | null): string {
  if (!location) {
    return '当前位置';
  }
  if (!location.adm2 || location.adm2 === location.name) {
    return location.name;
  }
  return `${location.adm2}·${location.name}`;
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd frontend && npm test -- src/utils/location-display.spec.ts
```

预期:PASS(5 个用例)

- [ ] **Step 6: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add frontend/src/types/location.ts frontend/src/utils/location-display.ts \
        frontend/src/utils/location-display.spec.ts
git commit -m "$(cat <<'EOF'
Add formatLocationName for consistent place labels

两个坑都来自实测:直辖市反查出来是区级("东城"而非"北京"),地级市自身的 name
与 adm2 重复("厦门"/"厦门")无脑拼接会得到"厦门 厦门"。顶部标题和搜索结果
列表共用这个函数。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 6: 前端 geo API 封装层

**Files:**
- Create: `frontend/src/api/geo.ts`
- Test: `frontend/src/api/geo.spec.ts`

**Interfaces:**
- Consumes:`NormalizedLocation`(Task 5)、Task 3 的三个路由
- Produces:供 Task 7、Task 8 使用
  - `fetchReverseLocation(lat: number, lon: number): Promise<NormalizedLocation | null>`
  - `searchLocations(q: string): Promise<NormalizedLocation[]>`
  - `fetchTopLocations(): Promise<NormalizedLocation[]>`

- [ ] **Step 1: 写失败测试**

```typescript
// frontend/src/api/geo.spec.ts
import { fetchReverseLocation, fetchTopLocations, searchLocations } from './geo';

const dongcheng = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

describe('geo api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchReverseLocation 请求 /geo/reverse 并取出 location', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ location: dongcheng }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReverseLocation(39.9042, 116.4074)).resolves.toEqual(dongcheng);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/geo\/reverse\?lat=39\.9042&lon=116\.4074$/),
    );
  });

  it('fetchReverseLocation 在后端返回 location:null 时给出 null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ location: null }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReverseLocation(0, 0)).resolves.toBeNull();
  });

  it('fetchReverseLocation 在 HTTP 失败时也返回 null,不抛错 —— 地名不该打断天气流程', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReverseLocation(39.9042, 116.4074)).resolves.toBeNull();
  });

  it('searchLocations 对关键词做 URL 编码', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ locations: [dongcheng] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchLocations('北京')).resolves.toEqual([dongcheng]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('北京')));
  });

  it('searchLocations 在 HTTP 失败时抛错 —— 用户主动发起的操作必须有反馈', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchLocations('北京')).rejects.toThrow('HTTP 500');
  });

  it('fetchTopLocations 在 HTTP 失败时返回空数组,不抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTopLocations()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npm test -- src/api/geo.spec.ts
```

预期:模块不存在,报错失败。

- [ ] **Step 3: 实现**

```typescript
// frontend/src/api/geo.ts
import type { NormalizedLocation } from '../types/location';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * 坐标反查地名。失败一律返回 null 而不抛错 —— 地名是锦上添花,不该打断天气流程。
 * 后端在上游失败时也返回 200 + location:null,这里再兜一层网络层失败。
 */
export async function fetchReverseLocation(lat: number, lon: number): Promise<NormalizedLocation | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/geo/reverse?lat=${lat}&lon=${lon}`);
    if (!response.ok) {
      return null;
    }
    const body: { location: NormalizedLocation | null } = await response.json();
    return body.location;
  } catch {
    return null;
  }
}

/** 关键词搜索。失败要抛错,让调用方能显示可重试的提示 —— 这是用户主动发起的操作。 */
export async function searchLocations(q: string): Promise<NormalizedLocation[]> {
  const response = await fetch(`${API_BASE_URL}/geo/search?q=${encodeURIComponent(q)}`);
  if (!response.ok) {
    throw new Error(`城市搜索失败: HTTP ${response.status}`);
  }
  const body: { locations: NormalizedLocation[] } = await response.json();
  return body.locations;
}

/** 热门城市,只用于搜索层空状态。失败返回空数组,调用方退回提示文案。 */
export async function fetchTopLocations(): Promise<NormalizedLocation[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/geo/top`);
    if (!response.ok) {
      return [];
    }
    const body: { locations: NormalizedLocation[] } = await response.json();
    return body.locations;
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npm test -- src/api/geo.spec.ts
```

预期:PASS(6 个用例)

- [ ] **Step 5: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add frontend/src/api/geo.ts frontend/src/api/geo.spec.ts
git commit -m "$(cat <<'EOF'
Add geo API wrappers mirroring the backend's asymmetric failure contract

reverse 和 top 失败返回 null/[] 不抛错,search 失败抛错 —— 与后端三个路由的
失败行为一一对应,调用方不需要再判断该不该报错。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: App.vue 并行请求天气与地名

**Files:**
- Modify: `frontend/src/App.vue`
- Modify: `frontend/src/stores/weather.ts`
- Test: `frontend/src/App.spec.ts`(修改现有用例 + 新增)

**Interfaces:**
- Consumes:`fetchReverseLocation`(Task 6)、`formatLocationName`(Task 5)
- Produces:顶部标题显示真实地名;`selectCity` 的入参类型从 `City` 换成 `NormalizedLocation`,供 Task 8 的 `CitySearch` 对接

**关键约束:地名不能拖慢天气。** 拿到坐标后两个请求**并行**发出,天气先到就先渲染,地名后到再更新标题。不要 `await` 反查之后再请求天气。

- [ ] **Step 1: 修改 store,让 cityName 可被单独更新**

`frontend/src/stores/weather.ts` 的 `actions` 里新增一个 action(放在 `loadWeather` 之后):

```typescript
    // 地名是异步反查出来的,到达时间晚于天气,所以要能单独更新标题
    setCityName(cityName: string) {
      this.cityName = cityName;
    },
```

- [ ] **Step 2: 写失败测试**

在 `frontend/src/App.spec.ts` 顶部的 import 里加上:

```typescript
import * as geoApi from './api/geo';
```

然后在 `describe('App', ...)` 内部追加两个用例:

```typescript
  it('定位成功后用反查到的地名替换标题,且不阻塞天气渲染', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.9042, longitude: 116.4074 } } as GeolocationPosition),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-03T00:00:00+08:00',
            current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
            hourly: [],
            daily: [],
          },
        },
      ],
    });
    vi.spyOn(geoApi, 'fetchReverseLocation').mockResolvedValue({
      id: '101011600',
      name: '东城',
      adm1: '北京市',
      adm2: '北京',
      lat: 39.91755,
      lon: 116.41876,
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(geoApi.fetchReverseLocation).toHaveBeenCalledWith(39.9042, 116.4074);
    expect(wrapper.text()).toContain('北京·东城');
    // 天气照常渲染
    expect(wrapper.text()).toContain('和风天气');
  });

  it('地名反查失败时标题回落到「当前位置」,天气不受影响', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.9042, longitude: 116.4074 } } as GeolocationPosition),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-03T00:00:00+08:00',
            current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
            hourly: [],
            daily: [],
          },
        },
      ],
    });
    vi.spyOn(geoApi, 'fetchReverseLocation').mockResolvedValue(null);

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain('当前位置');
    expect(wrapper.text()).toContain('和风天气');
  });
```

- [ ] **Step 3: 运行测试确认失败**

```bash
cd frontend && npm test -- src/App.spec.ts
```

预期:两个新用例失败(`fetchReverseLocation` 未被调用、标题仍是"当前位置"而非"北京·东城")。

- [ ] **Step 4: 修改 App.vue**

`<script setup>` 部分做四处改动:

1. 删掉 `import type { City } from './data/cities';`,换成:

```typescript
import type { NormalizedLocation } from './types/location';
import { fetchReverseLocation } from './api/geo';
import { formatLocationName } from './utils/location-display';
```

2. `selectCity` 的参数类型换成 `NormalizedLocation`,并用 `formatLocationName` 生成标题:

```typescript
async function selectCity(location: NormalizedLocation) {
  searchOpen.value = false;
  locationDenied.value = false;
  await store.loadWeather(location.lat, location.lon, formatLocationName(location));
}
```

3. `onMounted` 改成并行请求:

```typescript
onMounted(async () => {
  applyDayPart();
  let coords;
  try {
    coords = await requestCurrentLocation();
  } catch {
    locationDenied.value = true;
    // 定位失败时直接把搜索层推到用户面前,不用他自己找入口
    searchOpen.value = true;
    return;
  }

  // 天气和地名并行发出:地名到得晚,不能让它拖慢天气渲染。
  // 反查失败时 fetchReverseLocation 返回 null,标题保持"当前位置"
  store.loadWeather(coords.lat, coords.lon, '当前位置');
  const location = await fetchReverseLocation(coords.lat, coords.lon);
  if (location) {
    store.setCityName(formatLocationName(location));
  }
});
```

4. 模板里的标题保持 `{{ store.cityName ?? '天气对比' }}` 不变 —— `cityName` 现在由 store 统一持有,反查到了就被替换掉。

- [ ] **Step 5: 运行测试确认通过**

```bash
cd frontend && npm test -- src/App.spec.ts
```

预期:PASS。注意此时 `CitySearch` 仍是旧的静态列表版本,`selectCity` 的类型改了但 `CitySearch` 还在 emit `City` —— TypeScript 会报错,这是**预期的**,Task 8 会修好。本步只要 `npm test` 通过即可,**先不要跑 `npm run build`**。

- [ ] **Step 6: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add frontend/src/App.vue frontend/src/App.spec.ts frontend/src/stores/weather.ts
git commit -m "$(cat <<'EOF'
Show the reverse-geocoded place name in the header

天气和地名并行请求,地名到得晚不阻塞天气渲染;反查失败时标题保持"当前位置"。
store 新增 setCityName,因为地名的到达时间晚于 loadWeather。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---
### Task 8: CitySearch 异步化,删除静态城市列表

**Files:**
- Modify: `frontend/src/components/CitySearch.vue`
- Test: `frontend/src/components/CitySearch.spec.ts`(整体重写)
- Delete: `frontend/src/data/cities.ts`
- Delete: `frontend/src/data/cities.spec.ts`

**Interfaces:**
- Consumes:`searchLocations` / `fetchTopLocations`(Task 6)、`formatLocationName`(Task 5)
- Produces:`<CitySearch :open="boolean" @select="(location: NormalizedLocation) => void" @close="() => void" />`,与 Task 7 的 `selectCity` 对接

**这个任务要处理四件事,缺一不可:**

1. **防抖 300ms** —— 输入停止后才发请求,否则每敲一个字打一次后端
2. **丢弃过期响应** —— 用自增序号标记请求,先发后到的结果不得覆盖更新的结果
3. **加载态与失败态** —— 搜索失败要给出可重试的提示
4. **热门城市空状态** —— 打开且未输入时展示 `/geo/top`,失败则退回原提示文案

- [ ] **Step 1: 重写测试**

```typescript
// frontend/src/components/CitySearch.spec.ts
import { flushPromises, mount } from '@vue/test-utils';
import CitySearch from './CitySearch.vue';
import * as geoApi from '../api/geo';
import type { NormalizedLocation } from '../types/location';

const beijing: NormalizedLocation = {
  id: '101010100',
  name: '北京',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.9042,
  lon: 116.4074,
};
const chaoyangLn: NormalizedLocation = {
  id: '101071201',
  name: '朝阳',
  adm1: '辽宁省',
  adm2: '朝阳',
  lat: 41.576,
  lon: 120.446,
};
const chaoyangBj: NormalizedLocation = {
  id: '101010300',
  name: '朝阳',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.9219,
  lon: 116.4435,
};

// 防抖靠计时器,必须用假计时器才能确定性地测
const openSearch = () => mount(CitySearch, { props: { open: true } });

describe('CitySearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(geoApi, 'fetchTopLocations').mockResolvedValue([beijing]);
    vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('打开时展示热门城市作为空状态', async () => {
    const wrapper = openSearch();
    await flushPromises();

    expect(geoApi.fetchTopLocations).toHaveBeenCalled();
    expect(wrapper.text()).toContain('北京');
  });

  it('热门城市获取失败时退回提示文案,不显示错误', async () => {
    vi.spyOn(geoApi, 'fetchTopLocations').mockResolvedValue([]);

    const wrapper = openSearch();
    await flushPromises();

    expect(wrapper.text()).toContain('输入城市名开始搜索');
  });

  it('输入后要等 300ms 才发请求,期间连续输入只发一次', async () => {
    const searchSpy = vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([beijing]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北');
    await wrapper.find('input').setValue('北京');
    expect(searchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith('北京');
  });

  it('渲染搜索结果,同名地点靠上级城市区分', async () => {
    vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([chaoyangLn, chaoyangBj]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('朝阳');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
    // formatLocationName:name === adm2 时只显示 name,不同则显示「市·区」
    expect(items[0].text()).toContain('朝阳');
    expect(items[1].text()).toContain('北京·朝阳');
    // 副标题用省级区分辽宁的朝阳和北京的朝阳
    expect(items[0].text()).toContain('辽宁省');
  });

  it('点击结果时 emit 完整的地点对象', async () => {
    vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([beijing]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北京');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    await wrapper.find('li button').trigger('click');

    expect(wrapper.emitted('select')![0][0]).toEqual(beijing);
  });

  it('丢弃过期响应:先发的请求后返回,不得覆盖更新的结果', async () => {
    let resolveSlow: (v: NormalizedLocation[]) => void = () => {};
    const slow = new Promise<NormalizedLocation[]>((r) => {
      resolveSlow = r;
    });
    vi.spyOn(geoApi, 'searchLocations')
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce([chaoyangBj]);

    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北');
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.find('input').setValue('朝阳');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    // 第二个请求已经返回并渲染
    expect(wrapper.text()).toContain('北京·朝阳');

    // 第一个请求这时才姗姗来迟,必须被丢弃
    resolveSlow([beijing]);
    await flushPromises();

    expect(wrapper.text()).toContain('北京·朝阳');
    expect(wrapper.findAll('li')).toHaveLength(1);
  });

  it('搜索失败时给出可重试的提示', async () => {
    vi.spyOn(geoApi, 'searchLocations').mockRejectedValue(new Error('HTTP 500'));
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北京');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(wrapper.text()).toContain('搜索失败');
    // 不把上游/HTTP 细节暴露给用户
    expect(wrapper.text()).not.toContain('HTTP 500');
  });

  it('清空输入时回到热门城市,并且不再发请求', async () => {
    const searchSpy = vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([chaoyangBj]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('朝阳');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(searchSpy).toHaveBeenCalledTimes(1);

    await wrapper.find('input').setValue('');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('北京');
  });

  it('关闭时不渲染任何东西', () => {
    const wrapper = mount(CitySearch, { props: { open: false } });
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('点击取消时 emit close', async () => {
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('.city-search__cancel').trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npm test -- src/components/CitySearch.spec.ts
```

预期:失败(组件仍在用静态列表,没有调用 `fetchTopLocations`)。

- [ ] **Step 3: 重写 CitySearch.vue 的 script 与 template**

```vue
<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { fetchTopLocations, searchLocations } from '../api/geo';
import { formatLocationName } from '../utils/location-display';
import type { NormalizedLocation } from '../types/location';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ select: [location: NormalizedLocation]; close: [] }>();

const SEARCH_DEBOUNCE_MS = 300;

const keyword = ref('');
const results = ref<NormalizedLocation[]>([]);
const topCities = ref<NormalizedLocation[]>([]);
const searching = ref(false);
const searchFailed = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
// 自增序号用来丢弃过期响应:先发后到的请求不得覆盖更新的结果
let requestSeq = 0;

async function runSearch(q: string) {
  const seq = ++requestSeq;
  searching.value = true;
  searchFailed.value = false;
  try {
    const locations = await searchLocations(q);
    if (seq !== requestSeq) return;
    results.value = locations;
  } catch {
    if (seq !== requestSeq) return;
    // 只给用户一句可重试的话,HTTP 细节留在控制台/服务端日志里
    searchFailed.value = true;
    results.value = [];
  } finally {
    if (seq === requestSeq) {
      searching.value = false;
    }
  }
}

watch(keyword, (value) => {
  clearTimeout(debounceTimer);
  const trimmed = value.trim();
  if (!trimmed) {
    // 清空输入:取消进行中的请求(靠自增序号让它的结果失效),回到热门城市
    requestSeq += 1;
    results.value = [];
    searching.value = false;
    searchFailed.value = false;
    return;
  }
  searching.value = true;
  debounceTimer = setTimeout(() => void runSearch(trimmed), SEARCH_DEBOUNCE_MS);
});

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      keyword.value = '';
      return;
    }
    await nextTick();
    inputEl.value?.focus();
    if (topCities.value.length === 0) {
      // fetchTopLocations 失败时返回空数组,模板会退回提示文案
      topCities.value = await fetchTopLocations();
    }
  },
  { immediate: true },
);

function selectLocation(location: NormalizedLocation) {
  emit('select', location);
  keyword.value = '';
}
</script>

<template>
  <div v-if="open" class="city-search" role="dialog" aria-label="搜索城市">
    <div class="city-search__bar">
      <input
        ref="inputEl"
        v-model="keyword"
        type="search"
        placeholder="搜索城市"
        aria-label="搜索城市"
        autocomplete="off"
      />
      <button type="button" class="city-search__cancel" @click="emit('close')">取消</button>
    </div>

    <!-- 有输入:结果 / 加载中 / 失败 -->
    <template v-if="keyword.trim()">
      <ul v-if="results.length > 0" class="city-search__results">
        <li v-for="item in results" :key="item.id">
          <button type="button" @click="selectLocation(item)">
            <span class="city-search__name">{{ formatLocationName(item) }}</span>
            <span class="city-search__adm">{{ item.adm1 }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="searching" class="city-search__hint">搜索中…</p>
      <p v-else-if="searchFailed" class="city-search__hint">搜索失败,请稍后重试</p>
      <p v-else class="city-search__hint">没有找到「{{ keyword.trim() }}」</p>
    </template>

    <!-- 无输入:热门城市,拿不到就退回提示文案 -->
    <template v-else>
      <ul v-if="topCities.length > 0" class="city-search__results">
        <li v-for="item in topCities" :key="item.id">
          <button type="button" @click="selectLocation(item)">
            <span class="city-search__name">{{ formatLocationName(item) }}</span>
            <span class="city-search__adm">{{ item.adm1 }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="city-search__hint">输入城市名开始搜索</p>
    </template>
  </div>
</template>
```

- [ ] **Step 4: 补样式**

`<style scoped>` 里,把原来的 `.city-search__results button` 规则替换成下面这段(其余规则不动,`.city-search__empty` 那条可以删掉,模板已不再使用):

```css
.city-search__results button {
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  text-align: left;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.city-search__name {
  font-size: 16px;
}

/* 省级名用来区分同名地点(辽宁的朝阳 vs 北京的朝阳) */
.city-search__adm {
  font-size: 12px;
  color: var(--ink-faint);
  white-space: nowrap;
}
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd frontend && npm test -- src/components/CitySearch.spec.ts
```

预期:PASS(11 个用例)

- [ ] **Step 6: 删除静态城市列表**

```bash
cd /home/huangyingming/test-code/weather-app
rm frontend/src/data/cities.ts frontend/src/data/cities.spec.ts
rmdir frontend/src/data
```

- [ ] **Step 7: 跑全量测试与构建**

```bash
cd frontend && npm test && npm run build
```

预期:全部 PASS,`vue-tsc` 类型检查干净(Task 7 遗留的 `City` 类型不匹配到这一步才彻底消除)。如果构建报 `Cannot find module './data/cities'`,说明还有文件在引用已删除的模块,按报错路径清理。

- [ ] **Step 8: 提交**

```bash
cd /home/huangyingming/test-code/weather-app
git add frontend/src/components/CitySearch.vue frontend/src/components/CitySearch.spec.ts
git rm frontend/src/data/cities.ts frontend/src/data/cities.spec.ts
git commit -m "$(cat <<'EOF'
Replace the static city list with debounced GeoAPI search

四件事:300ms 防抖、用自增序号丢弃过期响应(先发后到的请求不得覆盖新结果)、
搜索失败给可重试提示、未输入时用热门城市填充空状态。

静态列表一并删除。它只有 20 个城市,而且搜"朝阳"分不清是北京的还是辽宁的 ——
现在结果里带省级名做区分。

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: 端到端联调与真实数据验证

**Files:**
- (无新增代码,纯联调;如有微调按前面任务的方式提交)

**Interfaces:**
- Consumes:Task 1-8 的全部产出

- [ ] **Step 1: 确认环境变量**

```bash
cd backend
grep -E '^GEO_' .env || echo "（.env 里没有 GEO_* 变量,将使用代码里的默认值 86400/60000/60,这是预期的）"
```

`GEO_*` 三个变量都有默认值,不配也能跑。`QWEATHER_API_HOST` / `QWEATHER_API_KEY` 必须已存在(GeoAPI 复用天气的凭据)。

- [ ] **Step 2: 启动后端,用真实凭据验证三个路由**

```bash
cd backend && npm run start:dev
```

另开一个终端:

```bash
# 反查:预期 name="东城" adm2="北京"
curl -s 'http://localhost:3000/geo/reverse?lat=39.9042&lon=116.4074' | python3 -m json.tool

# 搜索同名地点:预期返回多个"朝阳",adm1 分别是辽宁省和北京市
curl -s 'http://localhost:3000/geo/search?q=%E6%9C%9D%E9%98%B3' | python3 -m json.tool

# 拼音搜索:预期返回厦门
curl -s 'http://localhost:3000/geo/search?q=xiamen' | python3 -m json.tool

# 热门城市:预期返回 20 条
curl -s 'http://localhost:3000/geo/top' | python3 -c 'import json,sys;print(len(json.load(sys.stdin)["locations"]), "条")'

# 参数校验:两条都应返回 400
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/geo/reverse?lat=999&lon=116'
curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:3000/geo/search?q='
```

- [ ] **Step 3: 验证缓存生效**

```bash
# 连续两次同一个坐标,第二次应该明显更快(命中缓存,不打上游)
time curl -s -o /dev/null 'http://localhost:3000/geo/reverse?lat=31.2304&lon=121.4737'
time curl -s -o /dev/null 'http://localhost:3000/geo/reverse?lat=31.2304&lon=121.4737'
```

预期:第一次几百毫秒量级,第二次个位数毫秒。

- [ ] **Step 4: 验证 geo 限流与天气限流互不干扰**

```bash
# 连打 40 次 geo(超过 /weather 的 30 次额度,但在 geo 的 60 次以内)
for i in $(seq 1 40); do curl -s -o /dev/null -w '%{http_code} ' "http://localhost:3000/geo/search?q=%E5%8C%97%E4%BA%AC"; done; echo
# 紧接着请求天气,必须仍然是 200 —— 证明两份额度是独立的
curl -s -o /dev/null -w '\n天气: %{http_code}\n' 'http://localhost:3000/weather?lat=39.9042&lon=116.4074'
```

预期:40 次 geo 全部 `200`,随后的天气请求也是 `200`。如果天气返回 `429`,说明 Task 3 Step 7/8 的具名限流器或 `@SkipThrottle` 配错了。

- [ ] **Step 5: 前端联调**

```bash
cd frontend && npm run dev
```

浏览器打开本地地址(手机访问局域网地址更贴近真实使用):

1. 允许定位 → 顶部标题应显示真实地名(如"北京·东城"),**不再是"当前位置"**;两张天气卡片正常
2. 观察加载顺序 → 天气卡片应该**先于**标题地名出现,或至少不被它拖慢
3. 点右上角搜索图标 → 应直接看到热门城市列表,而不是空白提示
4. 输入"朝阳" → 结果里应同时出现辽宁的和北京的,靠右侧省级名区分
5. 输入"xiamen" → 应能搜到厦门
6. 选中任意城市 → 搜索层关闭,标题变成该城市名,两张卡片刷新为该城市数据
7. 刷新页面并**拒绝**定位 → 搜索层自动展开,且展示热门城市

- [ ] **Step 6: 验证后端不可用时前端的降级**

停掉后端,刷新前端页面:

- 顶部标题应显示"当前位置"(反查失败静默回落),而不是报错或空白
- 搜索时应出现"搜索失败,请稍后重试"
- 打开搜索层应显示"输入城市名开始搜索"(热门城市拿不到)

重启后端确认恢复正常。

- [ ] **Step 7: 全量回归**

```bash
cd backend && npm test && npm run build
cd ../frontend && npm test && npm run build
```

预期:两端测试全绿,构建干净。

- [ ] **Step 8: 确认没有残留进程与凭据泄漏**

```bash
cd /home/huangyingming/test-code/weather-app
git status --short          # 应为空,或只剩预期内的改动
git ls-files | grep -E '\.env$' || echo "✓ 没有 .env 进入版本库"
```

- [ ] **Step 9: 如有微调则提交**

Step 1-8 若产生代码改动,按前面任务同样的方式提交;若只是验证、没有改动,跳过。
