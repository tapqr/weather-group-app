import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { describeUpstreamError } from './upstream-error.js';
import {
  NormalizedAirQuality,
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
  wind?: {
    speed?: QWeatherMeasure;
    // compass 是英文缩写方位("ene"),刻意不用 —— 见 NormalizedCurrentWeather.windDirectionDeg
    direction?: { degree?: number; compass?: string };
    scale?: number;
  };
  precipitation?: { amount?: QWeatherMeasure; intensity?: QWeatherMeasure; type?: string };
  pressure?: QWeatherMeasure;
  visibility?: QWeatherMeasure;
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
    nighttime?: {
      condition?: QWeatherCondition;
    };
  }>;
}

// 空气质量是独立接口(/airquality/v1/current),响应形状和 /weather/v1/* 完全不同:
// 指数在 indexes[] 里按标准分条(国标 cn-mee、美标 us-epa 等),污染物浓度在 pollutants[] 里
interface QWeatherAirQualityResponse {
  indexes?: Array<{ code?: string; aqi?: number; category?: string }>;
  pollutants?: Array<{ code?: string; concentration?: QWeatherMeasure }>;
}

// 国标 AQI 在 indexes[] 里的 code。境外地点可能只返回 us-epa,那时国标项取不到,
// aqi/category 如实为 null(PM2.5 浓度仍可能有,它不依赖指数标准)
const CN_AQI_CODE = 'cn-mee';
const PM25_CODE = 'pm2p5';

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

// 能见度:v1 实测给的是米(21850 m),契约要 km。同样按 unit 判断而不是写死 ÷1000 ——
// 与 toKph 一个道理,单位变了要报 null 而不是静默算错 1000 倍
function toKm(distance: QWeatherMeasure | undefined): number | null {
  if (typeof distance?.value !== 'number') return null;
  if (distance.unit === 'm') return distance.value / 1000;
  return distance.unit === 'km' ? distance.value : null;
}

// 气压:v1 实测给的是 hPa(1011.66),契约也是 hPa,所以正常路径不换算。
// 仍然按 unit 判断,是为了防上游改成 Pa —— 彩云那边给的就是 Pa(100497.58),
// 这两个单位差 100 倍,静默算错的话气压会显示成 100497 hPa 而没人察觉
function toHpa(pressure: QWeatherMeasure | undefined): number | null {
  if (typeof pressure?.value !== 'number') return null;
  if (pressure.unit === 'Pa') return pressure.value / 100;
  return pressure.unit === 'hPa' ? pressure.value : null;
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
    const [current, hourly, daily, airQuality] = await Promise.allSettled([
      this.fetchCurrent(query),
      this.fetchHourly(query),
      this.fetchDaily(query),
      this.fetchAirQuality(query),
    ]);

    // 判"整家不可用"时**只看前三个核心子请求**,刻意不把空气质量算进去。
    // 理由:只有 AQI 成功、温度/逐时/逐日全挂的卡片对用户没有任何意义,那种情况仍应
    // 标记成 status:'error';反过来,AQI 单独挂掉只是少一栏指标,属于字段级缺失。
    //
    // current/hourly/daily 全部失败,说明这家整体不可用(Key 失效、专属 API Host 配错、
    // 网络不通等),向上抛出让 WeatherService 标记成 status:'error',前端才能展示
    // "该数据源暂时不可用";只要有任何一个成功,就正常返回,缺失的部分留 null/[]
    if (current.status === 'rejected' && hourly.status === 'rejected' && daily.status === 'rejected') {
      const reasons = [
        `current: ${describeUpstreamError(current.reason)}`,
        `hourly: ${describeUpstreamError(hourly.reason)}`,
        `daily: ${describeUpstreamError(daily.reason)}`,
      ].join('; ');
      throw new Error(`和风天气请求全部失败: ${reasons}`);
    }

    // 空气质量是独立接口,拼装在这里而不是 fetchCurrent 里 —— 这样它失败时只丢 AQI 这一栏,
    // 实况的温度/湿度/风速照常展示
    const current2 =
      current.status === 'fulfilled'
        ? { ...current.value, airQuality: airQuality.status === 'fulfilled' ? airQuality.value : null }
        : null;

    return {
      provider: this.name,
      updatedAt: new Date().toISOString(),
      current: current2,
      hourly: hourly.status === 'fulfilled' ? hourly.value : [],
      daily: daily.status === 'fulfilled' ? daily.value : [],
    };
  }

  // v1 把坐标放在路径里,且最多两位小数(约 1.1km,与缓存 key 的精度一致)
  private coords(query: WeatherQuery): string {
    const lat = Number(query.lat.toFixed(2));
    const lon = Number(query.lon.toFixed(2));
    return `${lat}/${lon}`;
  }

  private url(route: string, query: WeatherQuery): string {
    return `https://${this.apiHost}/weather/v1/${route}/${this.coords(query)}`;
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
      windDirectionDeg: typeof now.wind?.direction?.degree === 'number' ? now.wind.direction.degree : null,
      // 和风直接给等级,不用换算 —— 彩云那边没有这个字段,是从风速反算的(见 beaufort.ts)
      windScale: typeof now.wind?.scale === 'number' ? now.wind.scale : null,
      pressureHpa: toHpa(now.pressure),
      visibilityKm: toKm(now.visibility),
      // amount 是累计降水量(mm),intensity 是瞬时强度(mm/h)。取 amount 与彩云的
      // local.intensity 语义并不完全等价,但两家能拿到的最接近项就是这一对
      precipMm: measure(now.precipitation?.amount),
      // 由 getForecast 用独立子请求的结果填,这里占位
      airQuality: null,
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
    // conditionText 取白天段(daytime),nightConditionText 取夜间段(nighttime) ——
    // 两者真的会不同,2026-09-07 实测北京是"小雨 / 中雨"。降水概率只有 daytime 有。
    // forecastStartTime 是 2026-09-02T00:00+08:00,契约要的是 YYYY-MM-DD
    return response.data.days.map((entry) => ({
      date: entry.forecastStartTime.slice(0, 10),
      tempMinC: measure(entry.temperatureMin) as number,
      tempMaxC: measure(entry.temperatureMax) as number,
      conditionText: entry.daytime?.condition?.text ?? '',
      nightConditionText: entry.nighttime?.condition?.text ?? null,
      precipitationProbabilityPercent: toPercent(entry.daytime?.precipitation?.probability),
    }));
  }

  // v7 的 /v7/air/now 已被上游停用(2026-09-07 实测返回 403 Deprecated),
  // 只有这个 v1 接口可用。坐标顺序同样是 lat/lon,且不需要任何查询参数
  private async fetchAirQuality(query: WeatherQuery): Promise<NormalizedAirQuality> {
    const response = await firstValueFrom(
      this.httpService.get<QWeatherAirQualityResponse>(
        `https://${this.apiHost}/airquality/v1/current/${this.coords(query)}`,
        { headers: this.headers(), timeout: 8000 },
      ),
    );
    const data = response.data;
    const cnIndex = data.indexes?.find((index) => index.code === CN_AQI_CODE);
    const pm25 = data.pollutants?.find((pollutant) => pollutant.code === PM25_CODE);
    return {
      aqi: typeof cnIndex?.aqi === 'number' ? cnIndex.aqi : null,
      category: cnIndex?.category ?? null,
      pm25: measure(pm25?.concentration),
    };
  }
}
