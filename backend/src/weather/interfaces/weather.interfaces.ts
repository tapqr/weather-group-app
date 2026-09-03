export type ProviderName = 'qweather' | 'caiyun';

export interface WeatherQuery {
  lat: number;
  lon: number;
}

export interface NormalizedCurrentWeather {
  tempC: number;
  feelsLikeC: number | null;
  conditionText: string;
  humidityPercent: number | null;
  windSpeedKph: number | null;
}

export interface NormalizedHourlyEntry {
  time: string;
  tempC: number;
  conditionText: string;
  precipitationProbabilityPercent: number | null;
}

export interface NormalizedDailyEntry {
  /** 归一化为 `YYYY-MM-DD`(各家原始格式不同,统一在各 Provider 内部处理) */
  date: string;
  tempMinC: number;
  tempMaxC: number;
  conditionText: string;
  precipitationProbabilityPercent: number | null;
}

export interface NormalizedWeather {
  provider: ProviderName;
  updatedAt: string;
  current: NormalizedCurrentWeather | null;
  hourly: NormalizedHourlyEntry[];
  daily: NormalizedDailyEntry[];
}

export interface WeatherProvider {
  readonly name: ProviderName;
  getForecast(query: WeatherQuery): Promise<NormalizedWeather>;
}

export type ProviderResult =
  | { provider: ProviderName; status: 'ok'; data: NormalizedWeather }
  | { provider: ProviderName; status: 'error'; message: string };

export interface AggregatedWeatherResponse {
  results: ProviderResult[];
}
