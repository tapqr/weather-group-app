export type ProviderName = 'qweather' | 'caiyun';

export interface WeatherQuery {
  lat: number;
  lon: number;
}

/**
 * 空气质量。两家的原始形状差很远,统一成这三个字段:
 *   - 彩云:`realtime.air_quality` 里的 `aqi.chn` / `description.chn` / `pm25`,
 *     就在主站已经在调的那次综合请求里,不额外花上游额度
 *   - 和风:v1 需要单独调 `/airquality/v1/current/{lat}/{lon}`,取 `indexes[]` 里
 *     `code === 'cn-mee'` 那一项的 `aqi` / `category`,PM2.5 在 `pollutants[]` 里
 *
 * 两家都直接给中文类别("优"/"良"/…),所以 `category` 原样透传,不在这里做映射 ——
 * 一旦映射就得维护两张对照表,而上游给的中文本来就是同一套国标用语。
 */
export interface NormalizedAirQuality {
  /** 国标(cn-mee)AQI 数值 */
  aqi: number | null;
  /** 中文类别,如 "优"。上游原样透传 */
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
  /**
   * 风向角度,0~360(0/360 为正北)。
   *
   * 刻意只保留角度:和风额外给了英文缩写方位(`wind.direction.compass`,实测 "ene"),
   * 彩云只给角度(实测 `wind.direction: 36.13`)。若和风用 compass、彩云用角度换算,
   * 两家的分档口径就不一样了(compass 是 8 或 16 分位,取决于上游),并排比较会出现
   * "同一个风向显示成两个方位"。统一用角度、在前端用同一个函数算中文方位,才可比。
   */
  windDirectionDeg: number | null;
  /**
   * 蒲福风力等级 0~12。
   *
   * ⚠️ 两家的来源不同,并排展示时要知道这件事:和风的 `wind.scale` 是上游直接给的,
   * 彩云**不提供**这个字段,是在 Provider 里按蒲福风级标准表从 km/h 反算的
   * (见 providers/beaufort.ts)。换算表是国际标准、不是估算,但它毕竟是导出量 ——
   * 两家风速接近时等级仍可能差一级,那是换算边界导致的,不是数据源分歧。
   */
  windScale: number | null;
  /** 气压,统一 hPa。彩云原始单位是 Pa(实测 100497.58),已在 Provider 里 ÷100 */
  pressureHpa: number | null;
  /** 能见度,统一 km。和风原始单位是 m(实测 21860),已在 Provider 里 ÷1000 */
  visibilityKm: number | null;
  /** 降水量/降水强度,mm。彩云取 `realtime.precipitation.local.intensity`(雷达实测值) */
  precipMm: number | null;
  /** 空气质量。整块为 null 表示这家拿不到(字段级缺失,不影响 status) */
  airQuality: NormalizedAirQuality | null;
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
  /**
   * 白天段天气。两家都取白天而非整天,才能和 `nightConditionText` 配成一对:
   * 和风取 `daytime.condition.text`,彩云取 `skycon_08h_20h`(08:00–20:00)。
   */
  conditionText: string;
  /**
   * 夜间段天气。和风取 `nighttime.condition.text`,彩云取 `skycon_20h_32h`
   * (20:00 至次日 08:00,"32h" 就是次日 08:00 的意思)。
   *
   * 昼夜真的会不同 —— 2026-09-07 实测北京彩云是"多云 / 小雨"、和风是"小雨 / 中雨"。
   * 拿不到时为 null,前端只显示白天那一个。
   */
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
