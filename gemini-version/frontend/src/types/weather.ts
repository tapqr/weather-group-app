export interface ProviderWeatherRealtime {
  source: 'caiyun' | 'qweather';
  sourceName: string;
  temp: number;
  feelsLike: number;
  text: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  windScale: string;
  windDir: string;
  precip: number;
  pressure: number;
  visibility: number;
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
  time: string;
  datetime: string;
  caiyun: {
    temp: number;
    text: string;
    icon: string;
    pop: number;
    precip: number;
  };
  qweather: {
    temp: number;
    text: string;
    icon: string;
    pop: number;
    precip: number;
  };
  tempDiff: number;
  isDivergent: boolean;
}

export interface DailyComparisonItem {
  date: string;
  weekday: string;
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
  tempRangeDiff: number;
  agreement: 'high' | 'moderate' | 'low';
}

export interface MinutelyRainData {
  summary: string;
  radarRainList: number[];
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

export interface ConfigStatusResponse {
  caiyun: {
    configured: boolean;
    providerName: string;
    features: string[];
  };
  qweather: {
    configured: boolean;
    providerName: string;
    features: string[];
  };
}
