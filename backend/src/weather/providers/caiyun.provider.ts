import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import {
  NormalizedAirQuality,
  NormalizedCurrentWeather,
  NormalizedDailyEntry,
  NormalizedHourlyEntry,
  NormalizedWeather,
  WeatherProvider,
  WeatherQuery,
} from '../interfaces/weather.interfaces.js';
import { kphToBeaufortScale } from './beaufort.js';

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

/*
 * 下面两个换算刻意用"量级推断"而不是像和风那样读 unit 字段 —— 因为彩云的
 * realtime.pressure / realtime.visibility 是**裸数字,响应里没有任何单位信息**
 * (实测 pressure: 100497.58、visibility: 20.1)。
 *
 * 写死 ÷100 / 原样透传当然更短,但这正是 CLAUDE.md 里记着的那类事故的成因:
 * 上游某天换了单位,数字会静默错 100 倍或 1000 倍,而气压/能见度这两个量
 * 没人盯着,错了也不会有人报。量级推断让两种单位都能算对,并且落在两者之间的
 * 荒谬值(说明上游真的变了)如实返回 null,前端显示"—"。
 */

// 气压 → hPa。地面气压的物理范围:世界最低记录约 870 hPa(台风眼),最高约 1085 hPa,
// 青藏高原 5000m 处约 540 hPa。取 300~1100 hPa 作为"已经是 hPa"的判定区间
// (300 hPa 约对应 9000m,比珠峰还高),Pa 制则是这个区间的 100 倍。
function caiyunPressureToHpa(pressure: number | undefined): number | null {
  if (typeof pressure !== 'number' || !Number.isFinite(pressure)) return null;
  if (pressure >= 30000 && pressure <= 110000) return pressure / 100;
  return pressure >= 300 && pressure <= 1100 ? pressure : null;
}

// 能见度 → km。彩云实测给的就是 km(20.1);若某天改成米,值会跳到 20100 这个量级。
// 气象能见度上限按 100 km 计(超过这个数在观测上没有意义)。
function caiyunVisibilityToKm(visibility: number | undefined): number | null {
  if (typeof visibility !== 'number' || !Number.isFinite(visibility) || visibility < 0) return null;
  if (visibility > 1000) return visibility / 1000;
  return visibility <= 100 ? visibility : null;
}

// 彩云的空气质量就在综合请求的 realtime 里,不额外花上游额度。
// aqi 有 chn(国标)和 usa(美标)两套,description 同理 —— 取国标那一套,
// 和风侧取的也是国标(indexes[code='cn-mee']),两家才可比
function normalizeAirQuality(
  airQuality: NonNullable<CaiyunResult['realtime']>['air_quality'],
): NormalizedAirQuality | null {
  if (!airQuality) return null;
  return {
    aqi: typeof airQuality.aqi?.chn === 'number' ? airQuality.aqi.chn : null,
    category: airQuality.description?.chn ?? null,
    pm25: typeof airQuality.pm25 === 'number' ? airQuality.pm25 : null,
  };
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
    realtime?: {
      temperature: number;
      apparent_temperature?: number;
      humidity?: number;
      skycon: string;
      // 彩云的 wind 只有 speed(km/h)和 direction(角度),**没有风力等级** ——
      // 等级在下面用 kphToBeaufortScale 从速度反算
      wind?: { speed?: number; direction?: number };
      // 裸数字,不带单位字段。实测 pressure=100497.58(Pa)、visibility=20.1(km)
      pressure?: number;
      visibility?: number;
      // local 是雷达实测的本地降水强度,nearest 是最近降水带(带 distance);取 local
      precipitation?: { local?: { status?: string; intensity?: number } };
      air_quality?: {
        pm25?: number;
        aqi?: { chn?: number; usa?: number };
        description?: { chn?: string; usa?: string };
      };
    };
    hourly?: {
      temperature?: Array<{ datetime: string; value: number }>;
      skycon?: Array<{ datetime: string; value: string }>;
      precipitation?: Array<{ datetime: string; value: number; probability: number }>;
    };
    daily?: {
      temperature?: Array<{ date: string; max: number; min: number }>;
      // skycon 是整天的代表值;昼/夜分别在 skycon_08h_20h(08:00–20:00)和
      // skycon_20h_32h(20:00 至次日 08:00)里。三者会不同 —— 2026-09-07 实测北京
      // 整天/昼都是 PARTLY_CLOUDY_DAY,夜间却是 LIGHT_RAIN
      skycon?: Array<{ date: string; value: string }>;
      skycon_08h_20h?: Array<{ date: string; value: string }>;
      skycon_20h_32h?: Array<{ date: string; value: string }>;
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
      current: realtime ? this.mapCurrent(realtime) : null,
      hourly: this.mapHourly(hourly),
      daily: this.mapDaily(daily),
    };
  }

  private mapCurrent(realtime: NonNullable<CaiyunResult['realtime']>): NormalizedCurrentWeather {
    // 彩云天气在 metric/metric:v1/metric:v2 下风速单位已经是 km/h(只有 SI 才是 m/s),
    // 与和风天气的 windSpeed 单位一致,无需换算
    const windSpeedKph = realtime.wind?.speed ?? null;
    return {
      tempC: realtime.temperature,
      feelsLikeC: realtime.apparent_temperature ?? null,
      conditionText: skyconToText(realtime.skycon),
      humidityPercent: realtime.humidity === undefined ? null : Math.round(realtime.humidity * 100),
      windSpeedKph,
      windDirectionDeg: typeof realtime.wind?.direction === 'number' ? realtime.wind.direction : null,
      // 彩云不给风力等级,从风速反算。和风那边是上游直接给的 wind.scale ——
      // 契约注释里写明了这个来源差异,并排展示时不要当成数据源分歧
      windScale: kphToBeaufortScale(windSpeedKph),
      pressureHpa: caiyunPressureToHpa(realtime.pressure),
      visibilityKm: caiyunVisibilityToKm(realtime.visibility),
      // local 是雷达测到的本地降水强度(mm/h);和风那边取的是 amount(累计 mm)。
      // 两者语义不完全等价,但这是两家各自能给出的最接近项
      precipMm: typeof realtime.precipitation?.local?.intensity === 'number' ? realtime.precipitation.local.intensity : null,
      airQuality: normalizeAirQuality(realtime.air_quality),
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
      // 白天段用 skycon_08h_20h 而不是整天的 skycon —— 这样才和和风的 daytime 对齐。
      // 现有实现一直用整天值,与和风的 daytime 本来就没对齐;做昼夜分开时一并修正。
      // skycon_08h_20h 缺失时回落到整天值,不至于让天气文案整列空掉
      conditionText: skyconToText(daily?.skycon_08h_20h?.[index]?.value ?? daily?.skycon?.[index]?.value ?? ''),
      // 夜间段没有回落 —— 拿不到就是 null,前端只显示白天那一个。
      // 用整天值冒充夜间会造出"昼夜相同"的假象(gemini 那版就是这么做的)
      nightConditionText: daily?.skycon_20h_32h?.[index]?.value
        ? skyconToText(daily.skycon_20h_32h[index].value)
        : null,
      precipitationProbabilityPercent: daily?.precipitation?.[index]?.probability ?? null,
    }));
  }
}
