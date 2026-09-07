export type ProviderName = 'qweather' | 'caiyun';

/** 空气质量。两家都取国标(彩云 aqi.chn / 和风 indexes[cn-mee]),所以可比 */
export interface NormalizedAirQuality {
  aqi: number | null;
  /** 中文类别,如 "优"。后端原样透传上游文案,前端不再映射 */
  category: string | null;
  /** PM2.5 质量浓度,μg/m³ */
  pm25: number | null;
}

export interface NormalizedCurrentWeather {
  tempC: number;
  feelsLikeC: number | null;
  conditionText: string;
  humidityPercent: number | null;
  windSpeedKph: number | null;
  /** 风向角度 0~360。中文方位名由前端 formatWindDirection 算,两家口径才一致 */
  windDirectionDeg: number | null;
  /**
   * 蒲福风力等级 0~12。
   * 来源不同:和风是上游直接给的,彩云是后端从风速按标准表反算的。
   * 两家风速接近时等级仍可能差一级,那是换算边界,不是数据源分歧。
   */
  windScale: number | null;
  /** 气压,hPa(后端已统一,彩云原始是 Pa) */
  pressureHpa: number | null;
  /** 能见度,km(后端已统一,和风原始是 m) */
  visibilityKm: number | null;
  /** 降水量/强度,mm */
  precipMm: number | null;
  /** 整块为 null 表示这家拿不到 */
  airQuality: NormalizedAirQuality | null;
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
  /** 白天段天气(和风 daytime / 彩云 skycon_08h_20h) */
  conditionText: string;
  /** 夜间段天气(和风 nighttime / 彩云 skycon_20h_32h)。拿不到时为 null,只显示白天那个 */
  nightConditionText: string | null;
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
