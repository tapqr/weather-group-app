import { Inject, Injectable, Logger } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { WEATHER_PROVIDERS } from './providers/providers.tokens.js';
import { AggregatedWeatherResponse, ProviderResult, WeatherProvider, WeatherQuery } from './interfaces/weather.interfaces.js';

// 面向前端的稳定文案:不把上游异常的原始文本(可能含 URL、路径拼接的 token 等敏感信息)
// 透传给浏览器,真正的原因只记服务端日志
const USER_FACING_ERROR_MESSAGE = '数据源暂时不可用';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    @Inject(WEATHER_PROVIDERS) private readonly providers: WeatherProvider[],
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly configService: ConfigService,
  ) {}

  async getAggregatedForecast(query: WeatherQuery): Promise<AggregatedWeatherResponse> {
    const cacheKey = this.buildCacheKey(query);
    const cached = await this.cache.get<AggregatedWeatherResponse>(cacheKey);
    if (cached) {
      return cached;
    }

    const settled = await Promise.allSettled(this.providers.map((provider) => provider.getForecast(query)));
    const results: ProviderResult[] = settled.map((outcome, index) => {
      const provider = this.providers[index];
      if (outcome.status === 'fulfilled') {
        return { provider: provider.name, status: 'ok', data: outcome.value };
      }
      const reason = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      this.logger.warn(`Provider "${provider.name}" 请求失败: ${reason}`);
      return {
        provider: provider.name,
        status: 'error',
        message: USER_FACING_ERROR_MESSAGE,
      };
    });

    const response: AggregatedWeatherResponse = { results };
    await this.cache.set(cacheKey, response, this.resolveTtlSeconds(results) * 1000);
    return response;
  }

  // 四舍五入到小数点后 2 位(约 1.1km 精度),避免 GPS 抖动导致缓存命中率过低
  private buildCacheKey(query: WeatherQuery): string {
    return `weather:${query.lat.toFixed(2)}:${query.lon.toFixed(2)}`;
  }

  // 所有数据源都失败时只短时缓存:避免故障期间每个请求都去重试刷穿免费额度,
  // 同时保证第三方恢复后用户不用再等一个完整 TTL 才能看到数据
  private resolveTtlSeconds(results: ProviderResult[]): number {
    const everyProviderFailed = results.every((result) => result.status === 'error');
    if (everyProviderFailed) {
      return this.configService.get<number>('cache.failureTtlSeconds') ?? 60;
    }
    return this.configService.get<number>('cache.ttlSeconds') ?? 1800;
  }
}
