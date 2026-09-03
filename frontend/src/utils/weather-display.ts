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
