import type { NormalizedWeather, ProviderName } from '../types/weather';
import { classifyCondition } from './weather-display';

/*
 * 跨数据源的对齐与分歧判定。
 *
 * 两个设计前提,都不是随便定的:
 *
 * 1) **按时间戳对齐,绝不按数组下标。** 2026-09-07 实测:同一次请求里彩云的逐时
 *    从 15:00 开始、和风从 16:00 开始。按下标配对会把彩云 15:00 和和风 16:00
 *    当成同一时刻,整条曲线系统性错位一小时 —— 而且画出来完全看不出异常。
 *
 * 2) **按"极差"而不是"两家之差"判定。** 这个项目的页面是按 N 个数据源自适应的
 *    (App.vue 的 headline 用 grid-auto-flow: column,加一家不用改样式),
 *    所以判定也不能写死两家,否则加第三家时会静默只对比前两家。
 *    极差(max - min)在两家时与"差值"完全等价,多家时自然推广。
 */

/** 实况温度极差达到这个值就算明显分歧(沿用参考实现的口径) */
const TEMP_DIVERGENT_C = 2;
/** 温差没到 2° 但达到 1°,算"基本吻合但有差异" */
const TEMP_MODERATE_C = 1;
/** 逐时/逐日的降水概率超过这个百分比算"预报有雨" */
const RAIN_POP_PERCENT = 30;
/** 实况降水量超过这个毫米数算"正在下" */
const RAIN_PRECIP_MM = 0.1;
/** 逐日 (最高温极差 + 最低温极差) 的两档阈值 */
const DAILY_MODERATE_C = 4;
const DAILY_LOW_C = 6;
/** 有这么多天判为"分歧显著",整体就降到"基本吻合" */
const DIVERGENT_DAYS_FOR_MODERATE = 2;
/** 往后看这么多小时判断降水分歧。再往后的预报本身就不确定,报出来只是噪音 */
const RAIN_LOOKAHEAD_HOURS = 12;

export interface OkProvider {
  provider: ProviderName;
  label: string;
  data: NormalizedWeather;
}

// ---------- 逐时对齐 ----------

export interface HourlyAxisTick {
  /** 对齐键:ISO 字符串截到小时,如 "2026-09-07T15" */
  hourKey: string;
  /** 显示用的 "15:00" */
  label: string;
}

export interface HourlySeries {
  provider: ProviderName;
  label: string;
  /** 与 axis 等长。这家在该时刻没有数据时为 null(曲线在此断开) */
  temps: Array<number | null>;
  pops: Array<number | null>;
}

export interface AlignedHourly {
  axis: HourlyAxisTick[];
  series: HourlySeries[];
}

/**
 * 取 ISO 时间字符串的小时对齐键。
 *
 * 不走 Date 解析 —— 上游给的是带偏移的当地时间("2026-09-07T15:00+08:00"),
 * new Date() 会把它转成 UTC,再取小时就偏了。直接截字符串,和 ProviderCard
 * 里 formatHour 的做法一致。
 */
function hourKeyOf(isoTime: string): string {
  return isoTime.slice(0, 13);
}

function hourLabelOf(isoTime: string): string {
  const match = isoTime.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}` : isoTime;
}

/**
 * 把各数据源的逐时预报按时刻对齐成"共享 x 轴 + 每家一条序列"。
 *
 * 两家覆盖的时间窗不完全重合时,并集里两端各有一段只有单家有数据 ——
 * 那里如实留 null 让曲线断开,而不是拉平或补值:一条凭空补出来的线
 * 会让用户以为那家真的给了这个时刻的预报。
 */
export function alignHourly(providers: OkProvider[]): AlignedHourly {
  const keys = new Set<string>();
  const labelByKey = new Map<string, string>();
  for (const { data } of providers) {
    for (const entry of data.hourly) {
      const key = hourKeyOf(entry.time);
      keys.add(key);
      if (!labelByKey.has(key)) {
        labelByKey.set(key, hourLabelOf(entry.time));
      }
    }
  }
  // 键是 "YYYY-MM-DDTHH",字典序即时间序
  const axis = [...keys].sort().map((hourKey) => ({ hourKey, label: labelByKey.get(hourKey) ?? hourKey }));

  const series = providers.map(({ provider, label, data }) => {
    const byKey = new Map(data.hourly.map((entry) => [hourKeyOf(entry.time), entry]));
    return {
      provider,
      label,
      temps: axis.map((tick) => byKey.get(tick.hourKey)?.tempC ?? null),
      pops: axis.map((tick) => byKey.get(tick.hourKey)?.precipitationProbabilityPercent ?? null),
    };
  });

  return { axis, series };
}

// ---------- 逐日对齐 ----------

export type AgreementLevel = 'high' | 'moderate' | 'low';

export interface DailyCell {
  provider: ProviderName;
  label: string;
  tempMinC: number;
  tempMaxC: number;
  conditionText: string;
  nightConditionText: string | null;
  precipitationProbabilityPercent: number | null;
}

export interface AlignedDailyRow {
  date: string;
  cells: DailyCell[];
  /** 只有两家以上都给了这一天时才有值;单家独有的那天没有可比性 */
  agreement: AgreementLevel | null;
}

/**
 * 按日期对齐逐日预报并给出每天的一致性评级。
 *
 * 两家天数不同是常态(实测和风 7 天、彩云 3 天,免费版差异),所以用日期并集 ——
 * 只有一家覆盖的那几天照样列出来,但 agreement 为 null:一家独有的预报
 * 没有"一致不一致"可谈,标成"高度一致"是错的。
 */
export function alignDaily(providers: OkProvider[]): AlignedDailyRow[] {
  const dates = new Set<string>();
  for (const { data } of providers) {
    for (const entry of data.daily) dates.add(entry.date);
  }

  return [...dates].sort().map((date) => {
    const cells: DailyCell[] = [];
    for (const { provider, label, data } of providers) {
      const entry = data.daily.find((day) => day.date === date);
      if (entry) {
        cells.push({
          provider,
          label,
          tempMinC: entry.tempMinC,
          tempMaxC: entry.tempMaxC,
          conditionText: entry.conditionText,
          nightConditionText: entry.nightConditionText,
          precipitationProbabilityPercent: entry.precipitationProbabilityPercent,
        });
      }
    }
    return { date, cells, agreement: agreementOf(cells) };
  });
}

function spread(values: number[]): number {
  return values.length === 0 ? 0 : Math.max(...values) - Math.min(...values);
}

function agreementOf(cells: DailyCell[]): AgreementLevel | null {
  if (cells.length < 2) return null;
  const totalSpread = spread(cells.map((c) => c.tempMaxC)) + spread(cells.map((c) => c.tempMinC));
  const sameCondition = new Set(cells.map((c) => classifyCondition(c.conditionText))).size === 1;
  if (totalSpread > DAILY_LOW_C) return 'low';
  if (totalSpread > DAILY_MODERATE_C || !sameCondition) return 'moderate';
  return 'high';
}

// ---------- 总体共识 ----------

export type ConsensusLevel = 'high' | 'moderate' | 'divergent';

export interface Consensus {
  level: ConsensusLevel;
  /** 一句话结论 */
  headline: string;
  /** 各数据源的实况温度并列,以及极差 */
  tempNote: string;
  /** 降水判定是否一致 */
  rainNote: string;
  /** 其它值得说的点(逐日分歧天数、未来降水抬头的时刻等) */
  notes: string[];
}

/** 某家此刻是否算"有降水"。天气文案和降水量任一成立即算 */
function hasRainNow(provider: OkProvider): boolean {
  const current = provider.data.current;
  if (!current) return false;
  const category = classifyCondition(current.conditionText);
  if (category === 'rain' || category === 'snow') return true;
  return current.precipMm !== null && current.precipMm > RAIN_PRECIP_MM;
}

/**
 * 生成总体共识判定。
 *
 * ⚠️ 与参考实现(gemini 版)的一处**有意不同**:那份实现里实况温差只用来拼文案,
 * 从不参与 consensusStatus 判定 —— 两家温差 8° 但都说没雨时,它照样输出
 * "双源数据高度一致,预报可信度极高"。而温差恰恰是这个产品最该报警的分歧,
 * 所以这里把温差纳入判定。
 */
export function buildConsensus(providers: OkProvider[], hourly: AlignedHourly): Consensus | null {
  // 少于两家有数据时没有"共识"可谈 —— 这时页面不该显示这张卡
  const withCurrent = providers.filter((p) => p.data.current !== null);
  if (withCurrent.length < 2) return null;

  const temps = withCurrent.map((p) => ({ label: p.label, tempC: p.data.current!.tempC }));
  const tempSpread = spread(temps.map((t) => t.tempC));
  const rainFlags = withCurrent.map((p) => ({ label: p.label, rain: hasRainNow(p) }));
  const rainDisagree = new Set(rainFlags.map((r) => r.rain)).size > 1;
  const conditionDisagree =
    new Set(withCurrent.map((p) => classifyCondition(p.data.current!.conditionText))).size > 1;

  // 未来时段的降水判定分歧,与实况分歧同等重要(见 firstForecastRainDisagreement 的注释)
  const forecastRainSplit = firstForecastRainDisagreement(hourly, RAIN_LOOKAHEAD_HOURS);

  let level: ConsensusLevel = 'high';
  if (rainDisagree || forecastRainSplit !== null || tempSpread >= TEMP_DIVERGENT_C) {
    level = 'divergent';
  }

  const notes: string[] = [];

  if (forecastRainSplit) {
    notes.push(
      `${forecastRainSplit.label} 的降水预报不一致(${forecastRainSplit.readings
        .map((r) => `${r.label} ${r.pop}%`)
        .join(' / ')})`,
    );
  }

  // 逐日分歧天数
  const dailyRows = alignDaily(providers);
  const divergentDays = dailyRows.filter((row) => row.agreement === 'low').length;
  if (divergentDays > 0) {
    notes.push(`未来 ${divergentDays} 天的预报分歧显著`);
    if (level === 'high' && divergentDays >= DIVERGENT_DAYS_FOR_MODERATE) {
      level = 'moderate';
    }
  }

  if (level === 'high' && (tempSpread >= TEMP_MODERATE_C || conditionDisagree)) {
    level = 'moderate';
  }

  // 未来时段里最早出现"有一家报降水概率偏高"的时刻。
  // 上面已经报过"两家不一致"时就不再重复说一遍
  const upcoming = forecastRainSplit ? null : firstRainyTick(hourly, RAIN_LOOKAHEAD_HOURS);
  if (upcoming) {
    notes.push(
      `${upcoming.label} 前后降水概率抬头(${upcoming.readings.map((r) => `${r.label} ${r.pop}%`).join(' / ')})`,
    );
  }

  if (conditionDisagree) {
    notes.push(`实况天气判定不同:${withCurrent.map((p) => `${p.label}「${p.data.current!.conditionText}」`).join('、')}`);
  }

  return {
    level,
    headline: HEADLINE[level],
    tempNote:
      tempSpread === 0
        ? '各数据源的实况温度完全一致'
        : `实况温度相差 ${tempSpread.toFixed(1)}°(${temps.map((t) => `${t.label} ${Math.round(t.tempC)}°`).join(' / ')})`,
    rainNote: rainDisagree
      ? `实况降水判定分歧:${rainFlags.map((r) => `${r.label}${r.rain ? '有' : '无'}`).join('、')}`
      : rainFlags[0].rain
        ? '各数据源均判定当前有降水'
        : '各数据源均判定当前无降水',
    notes,
  };
}

const HEADLINE: Record<ConsensusLevel, string> = {
  high: '各数据源高度一致',
  moderate: '大体吻合,局部有差异',
  divergent: '存在明显分歧',
};

/**
 * 在前 n 个时刻里找第一个"各家对是否会下雨判断不一致"的点。
 *
 * 为什么必须有这一条:2026-09-07 实测北京,两家的**实况**都不是雨(彩云「晴」、
 * 和风「阴」)、温度只差 0.1°,但和风的逐时降水概率是 68% 而彩云是 0% ——
 * 只看实况和温差会把这种情况判成"大体吻合",而"一家说要下雨、一家说不会"
 * 恰恰是用户最需要被提醒的分歧。
 *
 * 判定口径沿用逐时那套:降水概率超过 RAIN_POP_PERCENT 即算"这家预报有雨"。
 * 只有两家以上都给了这个时刻的概率时才比较 —— 单家数据无所谓一致不一致。
 */
function firstForecastRainDisagreement(
  hourly: AlignedHourly,
  lookahead: number,
): { label: string; readings: Array<{ label: string; pop: number }> } | null {
  for (let i = 0; i < Math.min(lookahead, hourly.axis.length); i += 1) {
    const readings = hourly.series
      .map((s) => ({ label: s.label, pop: s.pops[i] }))
      .filter((r): r is { label: string; pop: number } => r.pop !== null);
    if (readings.length < 2) continue;
    if (new Set(readings.map((r) => r.pop > RAIN_POP_PERCENT)).size > 1) {
      return { label: hourly.axis[i].label, readings };
    }
  }
  return null;
}

/** 在前 n 个时刻里找第一个"有任一家降水概率超过阈值"的点 */
function firstRainyTick(
  hourly: AlignedHourly,
  lookahead: number,
): { label: string; readings: Array<{ label: string; pop: number }> } | null {
  for (let i = 0; i < Math.min(lookahead, hourly.axis.length); i += 1) {
    const readings = hourly.series
      .map((s) => ({ label: s.label, pop: s.pops[i] }))
      .filter((r): r is { label: string; pop: number } => r.pop !== null);
    if (readings.some((r) => r.pop > RAIN_POP_PERCENT)) {
      return { label: hourly.axis[i].label, readings };
    }
  }
  return null;
}
