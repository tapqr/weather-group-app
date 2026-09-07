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

interface QWeatherNowResponse {
  now: { temp: string; feelsLike?: string; text: string; humidity?: string; windSpeed?: string };
}

interface QWeatherHourlyResponse {
  hourly: Array<{ fxTime: string; temp: string; text: string; pop?: string }>;
}

interface QWeatherDailyResponse {
  daily: Array<{ fxDate: string; tempMax: string; tempMin: string; textDay: string }>;
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
      feelsLikeC: now.feelsLike ? Number(now.feelsLike) : null,
      conditionText: now.text,
      humidityPercent: now.humidity ? Number(now.humidity) : null,
      windSpeedKph: now.windSpeed ? Number(now.windSpeed) : null,
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
      precipitationProbabilityPercent: null,
    }));
  }
}
