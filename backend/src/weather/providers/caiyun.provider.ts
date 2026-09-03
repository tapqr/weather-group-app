import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { NormalizedDailyEntry, NormalizedHourlyEntry, NormalizedWeather, WeatherProvider, WeatherQuery } from '../interfaces/weather.interfaces.js';

const SKYCON_TEXT: Record<string, string> = {
  CLEAR_DAY: '晴',
  CLEAR_NIGHT: '晴',
  PARTLY_CLOUDY_DAY: '多云',
  PARTLY_CLOUDY_NIGHT: '多云',
  CLOUDY: '阴',
  LIGHT_HAZE: '轻度雾霾',
  MODERATE_HAZE: '中度雾霾',
  HEAVY_HAZE: '重度雾霾',
  LIGHT_RAIN: '小雨',
  MODERATE_RAIN: '中雨',
  HEAVY_RAIN: '大雨',
  STORM_RAIN: '暴雨',
  FOG: '雾',
  LIGHT_SNOW: '小雪',
  MODERATE_SNOW: '中雪',
  HEAVY_SNOW: '大雪',
  STORM_SNOW: '暴雪',
  DUST: '浮尘',
  SAND: '沙尘',
  WIND: '大风',
};

function skyconToText(skycon: string): string {
  return SKYCON_TEXT[skycon] ?? skycon;
}

// 彩云天气用 HTTP 状态码表达失败(400 token 不合法 / 401 无权限 / 403 被禁用或 IP 不在白名单 /
// 422 参数错误 / 429 额度用完或限流 / 500),body 里带 { status: 'failed', error: '...' }。
// axios 的 message 只有 "Request failed with status code 400",会把 error 里那句真正有用的
// 说明丢掉 —— 排障时就永远分不清是欠费、限流还是白名单。和风侧的 describeUpstreamError() 同理。
export function describeUpstreamError(error: unknown): string {
  const response = (error as { response?: { data?: unknown; headers?: Record<string, string> } })?.response;
  if (!response) {
    return error instanceof Error ? error.message : String(error);
  }

  const data = response.data;
  // 429 的响应体是纯文本 "Rate limit exceeded",不是 JSON
  const reason = typeof data === 'string' ? data : (data as { error?: string })?.error;
  if (!reason) {
    return error instanceof Error ? error.message : String(error);
  }

  const retryAfter = response.headers?.['retry-after'];
  return retryAfter ? `${reason}(Retry-After: ${retryAfter}s)` : reason;
}

type CaiyunResult = NonNullable<CaiyunWeatherResponse['result']>;

interface CaiyunWeatherResponse {
  // 文档(tables/errors.html)明确失败时返回 { status: 'failed', error: '...' },
  // 且 TIP 强调"请务必根据 HTTP Status Code 是否等于 200 判断 API 是否正常返回数据"
  status?: string;
  error?: string;
  result?: {
    realtime?: { temperature: number; apparent_temperature?: number; humidity?: number; skycon: string; wind?: { speed?: number } };
    hourly?: {
      temperature?: Array<{ datetime: string; value: number }>;
      skycon?: Array<{ datetime: string; value: string }>;
      precipitation?: Array<{ datetime: string; value: number; probability: number }>;
    };
    daily?: {
      temperature?: Array<{ date: string; max: number; min: number }>;
      skycon?: Array<{ date: string; value: string }>;
      precipitation?: Array<{ date: string; probability: number }>;
    };
  };
}

@Injectable()
export class CaiyunProvider implements WeatherProvider {
  readonly name = 'caiyun' as const;
  private readonly token: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.token = this.configService.get<string>('caiyun.token') ?? '';
  }

  async getForecast(query: WeatherQuery): Promise<NormalizedWeather> {
    let response;
    try {
      response = await firstValueFrom(
        this.httpService.get<CaiyunWeatherResponse>(
          `https://api.caiyunapp.com/v2.6/${this.token}/${query.lon},${query.lat}/weather`,
          { params: { dailysteps: 3, hourlysteps: 24, unit: 'metric:v2' }, timeout: 8000 },
        ),
      );
    } catch (error) {
      // 注意:抛出的详细原因只会进服务端日志。给前端的 message 由 WeatherService 统一
      // 换成固定文案 —— token 拼在 URL 路径里,原始异常文本可能带上完整 URL 泄露凭据
      throw new Error(`彩云天气请求失败: ${describeUpstreamError(error)}`);
    }
    const body = response.data;
    // 不做这道校验的话,失败响应会在下面解构时抛出 "Cannot destructure property 'realtime'",
    // 上游给的真实原因(token is invalid / Rate limit exceeded)就全丢了 ——
    // 和风侧有 describeUpstreamError() 做同样的事,这里是补齐对等处理
    if (body?.status !== 'ok' || !body.result) {
      throw new Error(`彩云天气返回失败: ${body?.error ?? body?.status ?? 'unknown'}`);
    }

    const { realtime, hourly, daily } = body.result;
    return {
      provider: this.name,
      updatedAt: new Date().toISOString(),
      // 单个子块缺失只丢那一块。此前任一子块缺失都会抛 undefined.map,导致整个数据源
      // 被判死 —— 连正常的实况和日预报也一起丢掉。和风侧是三段独立 allSettled、
      // 缺哪段留 null/[],这里是把降级粒度对齐
      current: realtime
        ? {
            tempC: realtime.temperature,
            feelsLikeC: realtime.apparent_temperature ?? null,
            conditionText: skyconToText(realtime.skycon),
            humidityPercent: realtime.humidity === undefined ? null : Math.round(realtime.humidity * 100),
            // 彩云天气在 metric/metric:v1/metric:v2 下风速单位已经是 km/h(只有 SI 才是 m/s),
            // 与和风天气的 windSpeed 单位一致,无需换算
            windSpeedKph: realtime.wind?.speed ?? null,
          }
        : null,
      hourly: this.mapHourly(hourly),
      daily: this.mapDaily(daily),
    };
  }

  private mapHourly(hourly: CaiyunResult['hourly']): NormalizedHourlyEntry[] {
    return (hourly?.temperature ?? []).map((entry, index) => ({
      time: entry.datetime,
      tempC: entry.value,
      conditionText: skyconToText(hourly?.skycon?.[index]?.value ?? ''),
      // 文档只在 hourly 页写明降水概率是 0~100(daily 页中英文两版都没写范围),
      // 2026-09-03 实测广州 [0,70,60]、厦门 [70,80,80],确认 daily 同样是 0~100
      precipitationProbabilityPercent: hourly?.precipitation?.[index]?.probability ?? null,
    }));
  }

  private mapDaily(daily: CaiyunResult['daily']): NormalizedDailyEntry[] {
    return (daily?.temperature ?? []).map((entry, index) => ({
      // 彩云天气返回的是 "2026-09-02T00:00+08:00",和风天气是 "2026-09-02";
      // 统一成 YYYY-MM-DD,前端才能按日期把两家的预报对齐成一行
      date: entry.date.slice(0, 10),
      tempMinC: entry.min,
      tempMaxC: entry.max,
      conditionText: skyconToText(daily?.skycon?.[index]?.value ?? ''),
      precipitationProbabilityPercent: daily?.precipitation?.[index]?.probability ?? null,
    }));
  }
}
