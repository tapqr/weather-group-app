/** 天气视觉分类。驱动卡片配色与图标,不参与任何数值计算。 */
export type ConditionCategory = 'clear' | 'cloudy' | 'rain' | 'snow' | 'haze' | 'wind' | 'unknown';

// 顺序即优先级,不能随意调整:
// - 「雪」在「雨」之前 —— 「雨夹雪」要归到雪,视觉辨识度更高
// - 「云」在「晴」之前 —— 「晴间多云」要归到多云
const CONDITION_KEYWORDS: Array<[readonly string[], ConditionCategory]> = [
  [['雪'], 'snow'],
  [['雨'], 'rain'],
  [['雾', '霾', '尘', '沙'], 'haze'],
  [['风'], 'wind'],
  [['云', '阴'], 'cloudy'],
  [['晴'], 'clear'],
];

/**
 * 把中文天气文案归类到有限的视觉分类。
 *
 * 两家数据源的文案来源不同:彩云是后端 SKYCON_TEXT 的受控映射(20 项,已与官方枚举核对一致),
 * 和风则是直接透传上游 text 字段、取值不受控 —— 所以这里必须有兜底分支。
 */
export function classifyCondition(text: string): ConditionCategory {
  for (const [keywords, category] of CONDITION_KEYWORDS) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return category;
    }
  }
  return 'unknown';
}

/** 一天中的时段。驱动顶部共享区的背景基调 —— 昼夜是客观事实,两家数据源在这件事上没有分歧。 */
export type DayPart = 'day' | 'twilight' | 'night';

/**
 * 用本地时间判定时段,不依赖任何 API。
 *
 * 彩云的 CLEAR_DAY / CLEAR_NIGHT 在后端被统一压成了「晴」,昼夜信息在归一化时就丢了;
 * 和风也没有对等字段。反正用户看的就是他此刻所在的时间,本地时钟是最直接的信息源。
 */
export function resolveDayPart(now: Date): DayPart {
  const hour = now.getHours();
  if (hour >= 7 && hour < 17) {
    return 'day';
  }
  if ((hour >= 5 && hour < 7) || (hour >= 17 && hour < 19)) {
    return 'twilight';
  }
  return 'night';
}

/**
 * 把温度格式化成显示用的整数字符串(不含单位符号)。
 *
 * 两家数据源的原始精度不同:和风返回整数(25),彩云返回两位小数(24.56)。
 * 并排显示时统一取整 —— 天气预报的实际精度本就只有 ±1~2°,彩云那两位小数是它的
 * 输出格式差异,不代表它更准,原样显示反而会让人误以为彩云更精确。
 */
export function formatTemperature(celsius: number | null): string {
  if (celsius === null) {
    return '—';
  }
  // `+` 消掉 Math.round(-0.4) 得到的 -0,否则会显示成 "-0"
  return String(Math.round(celsius) + 0);
}

/**
 * 风速统一取整(km/h,不含单位)。
 *
 * 和风返回整数(9),彩云返回两位小数(1.77),并排显示时和温度是同一类问题:
 * 小数不代表更准,只是数据源的输出格式差异。
 */
export function formatWindSpeed(kph: number | null): string {
  if (kph === null) {
    return '—';
  }
  return String(Math.round(kph));
}

/**
 * 风向角度 → 中文方位名。
 *
 * 气象上的"风向"指风的**来向**,0° 是北风(风从北边吹来),不是吹向北。
 *
 * 为什么在前端算而不用上游给的:和风给了英文缩写方位(`wind.direction.compass`,如 "ene"),
 * 彩云只给角度。如果一家用 compass、一家用角度换算,两家的分档口径就不一样了 ——
 * "ene"(东北偏东)属于 16 方位制,而角度换算出来是 8 方位制,并排显示会出现同一个风向
 * 被写成两个名字。统一从角度算,两家才可比。
 *
 * 用 8 方位而不是 16 方位:"东北偏东风"在手机上太长,会把指标行挤换行,
 * 而天气预报的风向精度本来也支撑不起 16 档。
 */
const COMPASS_POINTS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const;

export function formatWindDirection(degree: number | null): string {
  if (degree === null || !Number.isFinite(degree)) {
    return '—';
  }
  // 每 45° 一档,四舍五入后取模 —— 350° 和 10° 都该落回"北"
  const index = Math.round(((degree % 360) + 360) % 360 / 45) % 8;
  return `${COMPASS_POINTS[index]}风`;
}

/**
 * 气压取整(hPa,不含单位)。
 *
 * 彩云换算过来是 1004.9758 这种值(原始是帕),和风是 1011.66 ——
 * 小数位纯粹是单位换算和上游精度的产物,对"今天气压高不高"没有任何意义。
 */
export function formatPressure(hPa: number | null): string {
  return hPa === null ? '—' : String(Math.round(hPa));
}

/**
 * 能见度取整(km,不含单位)。20.15 / 21.85 这种小数同理,取整即可。
 */
export function formatVisibility(km: number | null): string {
  return km === null ? '—' : String(Math.round(km));
}

/**
 * 降水量(mm,不含单位)。
 *
 * 这里**保留一位小数**,和温度/风速的取整策略不同 —— 降水量本来就常在 0~1 之间,
 * 取整会把"0.4mm 的小雨"和"没下雨"都显示成 0,那是有意义的信息被抹掉。
 */
export function formatPrecip(mm: number | null): string {
  return mm === null ? '—' : mm.toFixed(1);
}

/**
 * 风力等级(不含"级"字)。
 *
 * 0 是"无风"这个真实观测值,必须显示成 "0" 而不是 "—" ——
 * 后端在拿不到风速时给的是 null,两者含义完全不同。
 */
export function formatWindScale(scale: number | null): string {
  return scale === null ? '—' : String(scale);
}
