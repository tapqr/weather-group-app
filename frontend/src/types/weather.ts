export type ProviderName = 'qweather' | 'caiyun';

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
  /** 后端保证为 `YYYY-MM-DD`(两家原始格式不同,已在后端各 Provider 内统一) */
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

export type ProviderResult =
  | { provider: ProviderName; status: 'ok'; data: NormalizedWeather }
  | { provider: ProviderName; status: 'error'; message: string };

export interface AggregatedWeatherResponse {
  results: ProviderResult[];
}
