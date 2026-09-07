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

// 和风 v1:数值一律是 { value, unit } 结构,比例类字段(湿度、降水概率、云量)是 0~1 小数
interface QWeatherMeasure {
  value: number;
  unit: string;
}

interface QWeatherCondition {
  text: string;
  code?: string;
}

interface QWeatherCurrentResponse {
  condition?: QWeatherCondition;
  temperature?: QWeatherMeasure;
  feelsLike?: QWeatherMeasure;
  humidity?: number;
  wind?: { speed?: QWeatherMeasure };
}

interface QWeatherHourlyResponse {
  hours: Array<{
    forecastTime: string;
    condition?: QWeatherCondition;
    temperature?: QWeatherMeasure;
    precipitation?: { probability?: number };
  }>;
}

interface QWeatherDailyResponse {
  days: Array<{
    forecastStartTime: string;
    temperatureMax?: QWeatherMeasure;
    temperatureMin?: QWeatherMeasure;
    daytime?: {
      condition?: QWeatherCondition;
      precipitation?: { probability?: number };
    };
  }>;
}

// 0~1 → 百分比。浮点相乘会给出 35.000000000000004 这种值,取整后才是契约要的整数百分比
function toPercent(ratio: number | undefined): number | null {
  return typeof ratio === 'number' ? Math.round(ratio * 100) : null;
}

// 按 unit 字段换算,而不是写死 ×3.6。v1 单位固定为公制且没有 unit 查询参数
// (https://dev.qweather.com/docs/resource/unit/),所以只认这两个值:
// 意外单位说明上游变了,报 null 让前端显示"—",好过把未知单位当成 km/h 静默错下去。
function toKph(speed: QWeatherMeasure | undefined): number | null {
  if (typeof speed?.value !== 'number') return null;
  if (speed.unit === 'm/s') return speed.value * 3.6;
  return speed.unit === 'km/h' ? speed.value : null;
}

function measure(value: QWeatherMeasure | undefined): number | null {
  return typeof value?.value === 'number' ? value.value : null;
}

@Injectable()
export class QWeatherV1Provider implements WeatherProvider {
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
        `current: ${describeUpstreamError(current.reason)}`,
        `hourly: ${describeUpstreamError(hourly.reason)}`,
        `daily: ${describeUpstreamError(daily.reason)}`,
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

  // v1 把坐标放在路径里,且最多两位小数(约 1.1km,与缓存 key 的精度一致)
  private url(route: string, query: WeatherQuery): string {
    const lat = Number(query.lat.toFixed(2));
    const lon = Number(query.lon.toFixed(2));
    return `https://${this.apiHost}/weather/v1/${route}/${lat}/${lon}`;
  }

  private headers() {
    return { 'X-QW-Api-Key': this.apiKey };
  }

  private async fetchCurrent(query: WeatherQuery): Promise<NormalizedCurrentWeather> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherCurrentResponse>(this.url('current', query), {
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    const now = response.data;
    return {
      tempC: measure(now.temperature) as number,
      feelsLikeC: measure(now.feelsLike),
      conditionText: now.condition?.text ?? '',
      humidityPercent: toPercent(now.humidity),
      windSpeedKph: toKph(now.wind?.speed),
    };
  }

  // localTime=true 是必须的:v1 默认返回 UTC,逐小时会整体偏 8 小时、逐天日期会退一天
  private async fetchHourly(query: WeatherQuery): Promise<NormalizedHourlyEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherHourlyResponse>(this.url('hourly', query), {
        params: { hours: 24, localTime: true },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    return response.data.hours.map((entry) => ({
      time: entry.forecastTime,
      tempC: measure(entry.temperature) as number,
      conditionText: entry.condition?.text ?? '',
      precipitationProbabilityPercent: toPercent(entry.precipitation?.probability),
    }));
  }

  private async fetchDaily(query: WeatherQuery): Promise<NormalizedDailyEntry[]> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherDailyResponse>(this.url('daily', query), {
        params: { days: 7, localTime: true },
        headers: this.headers(),
        timeout: 8000,
      }),
    );
    // 天气描述和降水概率取白天段(daytime),对应 v7 的 textDay;
    // forecastStartTime 是 2026-09-02T00:00+08:00,契约要的是 YYYY-MM-DD
    return response.data.days.map((entry) => ({
      date: entry.forecastStartTime.slice(0, 10),
      tempMinC: measure(entry.temperatureMin) as number,
      tempMaxC: measure(entry.temperatureMax) as number,
      conditionText: entry.daytime?.condition?.text ?? '',
      precipitationProbabilityPercent: toPercent(entry.daytime?.precipitation?.probability),
    }));
  }
}
