import type { NormalizedWeather, ProviderName } from '../types/weather';

/*
 * 跨数据源的逐时对齐。
 *
 * ⚠️ **按时间戳对齐,绝不按数组下标。** 2026-09-07 实测:同一次请求里彩云的逐时
 * 从 15:00 开始、和风从 16:00 开始。按下标配对会把彩云 15:00 和和风 16:00
 * 当成同一时刻,整条曲线系统性错位一小时 —— 而且画出来完全看不出异常。
 *
 * 这个文件刻意只做"对齐",不做任何聚合判定。曾经有过一个把差异归纳成
 * "高度一致 / 大体吻合 / 存在明显分歧"三档的总结卡,已经删掉 ——
 * 理由见 docs/adr/0002-no-consensus-verdict.md。
 */

export interface OkProvider {
  provider: ProviderName;
  label: string;
  data: NormalizedWeather;
}

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
