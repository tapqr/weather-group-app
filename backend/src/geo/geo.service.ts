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
