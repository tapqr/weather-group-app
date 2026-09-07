export interface ProviderWeatherRealtime {
  source: 'caiyun' | 'qweather';
  sourceName: string;
  temp: number;
  feelsLike: number;
  text: string;
  icon: string;
  humidity: number; // %
  windSpeed: number; // km/h
  windScale: string;
  windDir: string;
  precip: number; // mm
  pressure: number; // hPa
  visibility: number; // km
  aqi: {
    value: number;
    category: string;
    pm25?: number;
  };
  updateTime: string;
  isMock: boolean;
  statusText?: string;
}

export interface HourlyComparisonItem {
  time: string; // e.g. "14:00"
  datetime: string;
  caiyun: {
    temp: number;
    text: string;
    icon: string;
    pop: number; // 降水概率 0-100
    precip: number;
  };
  qweather: {
    temp: number;
    text: string;
    icon: string;
    pop: number;
    precip: number;
  };
  tempDiff: number; // caiyun - qweather
  isDivergent: boolean; // 是否存在明显分歧 (温差>2度 或 降雨预测不一致)
}

export interface DailyComparisonItem {
  date: string; // "2026-09-06"
  weekday: string; // "今天", "明天", "周一"
  caiyun: {
    maxTemp: number;
    minTemp: number;
    dayText: string;
    nightText: string;
    pop: number;
  };
  qweather: {
    maxTemp: number;
    minTemp: number;
    dayText: string;
    nightText: string;
    pop: number;
  };
  tempRangeDiff: number; // 温差差异度
  agreement: 'high' | 'moderate' | 'low';
}

export interface MinutelyRainData {
  summary: string; // e.g. "未来两小时无降水"
  radarRainList: number[]; // 120分钟降水序列 (采样每5/10分钟)
  probabilities: number[];
}

export interface WeatherComparisonAnalysis {
  consensusStatus: 'high' | 'moderate' | 'divergent';
  consensusText: string;
  tempDifferenceDesc: string;
  rainDifferenceDesc: string;
  highlights: string[];
}

export interface WeatherComparisonResponse {
  location: {
    city: string;
    district?: string;
    lat: number;
    lng: number;
  };
  realtime: {
    caiyun: ProviderWeatherRealtime;
    qweather: ProviderWeatherRealtime;
    tempDiff: number;
    feelsLikeDiff: number;
  };
  hourly: HourlyComparisonItem[];
  daily: DailyComparisonItem[];
  minutelyRain: {
    caiyun: MinutelyRainData;
    qweatherSummary?: string;
  };
  analysis: WeatherComparisonAnalysis;
  meta: {
    caiyunConfigured: boolean;
    qweatherConfigured: boolean;
    serverTime: string;
  };
}

export interface CityInfo {
  name: string;
  province?: string;
  district?: string;
  lat: number;
  lng: number;
  id?: string;
}
