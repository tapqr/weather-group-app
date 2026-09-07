import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { describeUpstreamError } from './upstream-error.js';
import {
  NormalizedCurrentWeather,
  NormalizedDailyEntry,
  NormalizedHourlyEntry,
  NormalizedWeather,
  WeatherProvider,
  WeatherQuery,
} from '../../interfaces/weather.interfaces.js';

/*
 * ⚠️ v7 已被上游停用。2026-09-07 用本仓库的真实 Key 实测:
 *   GET /v7/air/now  →  403 { "type": ".../#deprecated", "title": "Deprecated" }
 * 这份实现保留的意义是"v1 出问题时改 QWEATHER_API_VERSION 就能回滚"(见 configuration.ts),
 * 但它现在**打不通**,所以下面新增的字段映射是**按 v7 文档写的、未经实测**。
 * 真要启用 v7 之前,必须拿能用的 Key 逐个字段核对一遍 —— 尤其是单位。
 *
 * v7 的所有数值都是字符串,这是它和 v1({ value, unit } 结构)最大的形状差异。
 */
interface QWeatherNowResponse {
  now: {
    temp: string;
    feelsLike?: string;
    text: string;
    humidity?: string;
    windSpeed?: string;
    /** 风向角度(v7 文档:0~360) */
    wind360?: string;
    /** 风力等级 */
    windScale?: string;
    /** 降水量,mm */
    precip?: string;
    /** 气压,hPa —— 与契约同单位,不需换算 */
    pressure?: string;
    /** 能见度,km —— 注意与 v1 不同:v1 给的是米 */
    vis?: string;
  };
}

interface QWeatherHourlyResponse {
  hourly: Array<{ fxTime: string; temp: string; text: string; pop?: string }>;
}

interface QWeatherDailyResponse {
  daily: Array<{ fxDate: string; tempMax: string; tempMin: string; textDay: string; textNight?: string }>;
}

// v7 的数值是字符串。不能直接 Number() —— Number(undefined) 是 NaN,会把
// "字段缺失"变成一个悄悄污染下游计算的 NaN;空字符串则应算缺失而不是 0
function numeric(value: string | undefined): number | null {
  if (value === undefined || value === null || value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

@Injectable()
export class QWeatherV7Provider implements WeatherProvider {
  readonly name = 'qweather' as const;
  private readonly apiHost: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiHost = this.configService.get<string>('qweather.apiHost') ?? '';
    this.apiKey = this.configService.get<string>('qweather.apiKey') ?? '';
  }

  async getForecast(query: WeatherQuery): Promise<NormalizedWeather> {
    const [current, hourly, daily] = await Promise.allSettled([
      this.fetchCurrent(query),
      this.fetchHourly(query),
      this.fetchDaily(query),
    ]);

    // 三个子请求全部失败,说明这家整体不可用(Key 失效、专属 API Host 配错、网络不通等),
    // 向上抛出让 WeatherService 标记成 status:'error',前端才能展示"该数据源暂时不可用";
    // 只要有任何一个成功,就正常返回,缺失的部分留 null/[]
    if (current.status === 'rejected' && hourly.status === 'rejected' && daily.status === 'rejected') {
      const reasons = [
        `now: ${describeUpstreamError(current.reason)}`,
        `24h: ${describeUpstreamError(hourly.reason)}`,
        `7d: ${describeUpstreamError(daily.reason)}`,
      ].join('; ');
      throw new Error(`和风天气请求全部失败: ${reasons}`);
    }

    return {
      provider: this.name,
      updatedAt: new Date().toISOString(),
      current: current.status === 'fulfilled' ? current.value : null,
      hourly: hourly.status === 'fulfilled' ? hourly.value : [],
      daily: daily.status === 'fulfilled' ? daily.value : [],
    };
  }

  private location(query: WeatherQuery): string {
    return `${query.lon},${query.lat}`;
  }

  private headers() {
    return { 'X-QW-Api-Key': this.apiKey };
  }

  private async fetchCurrent(query: WeatherQuery): Promise<NormalizedCurrentWeather> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherNowResponse>(`https://${this.apiHost}/v7/weather/now`, {
        params: { location: this.location(query) },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    const { now } = response.data;
    return {
      tempC: Number(now.temp),
      feelsLikeC: numeric(now.feelsLike),
      conditionText: now.text,
      humidityPercent: numeric(now.humidity),
      // v7 的 windSpeed 单位就是 km/h(v1 是 m/s),这是两版之间第五处不兼容
      windSpeedKph: numeric(now.windSpeed),
      windDirectionDeg: numeric(now.wind360),
      windScale: numeric(now.windScale),
      pressureHpa: numeric(now.pressure),
      // v7 的 vis 单位是 km,不像 v1 那样要 ÷1000
      visibilityKm: numeric(now.vis),
      precipMm: numeric(now.precip),
      // v7 的空气质量接口 /v7/air/now 已被上游停用(实测 403 Deprecated),
      // 拿不到就如实为 null —— 走字段级缺失语义,前端显示"—"。
      // 绝不在这里填一个常量冒充实时数据
      airQuality: null,
    };
  }

  private async fetchHourly(query: WeatherQuery): Promise<NormalizedHourlyEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherHourlyResponse>(`https://${this.apiHost}/v7/weather/24h`, {
        params: { location: this.location(query) },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    return response.data.hourly.map((entry) => ({
      time: entry.fxTime,
      tempC: Number(entry.temp),
      conditionText: entry.text,
      precipitationProbabilityPercent: entry.pop ? Number(entry.pop) : null,
    }));
  }

  private async fetchDaily(query: WeatherQuery): Promise<NormalizedDailyEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherDailyResponse>(`https://${this.apiHost}/v7/weather/7d`, {
        params: { location: this.location(query) },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    // QWeather v7 的 daily 接口只有降水量(precip, mm),没有降水概率字段,如实标记为 null
    return response.data.daily.map((entry) => ({
      date: entry.fxDate,
      tempMinC: Number(entry.tempMin),
      tempMaxC: Number(entry.tempMax),
      conditionText: entry.textDay,
      // v7 的昼夜字段是 textDay / textNight,对应 v1 的 daytime / nighttime
      nightConditionText: entry.textNight ?? null,
      precipitationProbabilityPercent: null,
    }));
  }
}
