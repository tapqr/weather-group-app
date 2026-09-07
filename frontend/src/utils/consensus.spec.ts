import { alignDaily, alignHourly, buildConsensus, type OkProvider } from './consensus';
import type { NormalizedCurrentWeather, NormalizedDailyEntry, NormalizedHourlyEntry, ProviderName } from '../types/weather';

function current(overrides: Partial<NormalizedCurrentWeather> = {}): NormalizedCurrentWeather {
  return {
    tempC: 20,
    feelsLikeC: 20,
    conditionText: '晴',
    humidityPercent: 50,
    windSpeedKph: 10,
    windDirectionDeg: 90,
    windScale: 2,
    pressureHpa: 1011,
    visibilityKm: 20,
    precipMm: 0,
    airQuality: { aqi: 40, category: '优', pm25: 20 },
    ...overrides,
  };
}

function hour(time: string, tempC: number, pop: number | null = 0): NormalizedHourlyEntry {
  return { time, tempC, conditionText: '晴', precipitationProbabilityPercent: pop };
}

function day(
  date: string,
  tempMinC: number,
  tempMaxC: number,
  conditionText = '晴',
  nightConditionText: string | null = null,
): NormalizedDailyEntry {
  return { date, tempMinC, tempMaxC, conditionText, nightConditionText, precipitationProbabilityPercent: null };
}

function provider(
  name: ProviderName,
  label: string,
  parts: { current?: NormalizedCurrentWeather | null; hourly?: NormalizedHourlyEntry[]; daily?: NormalizedDailyEntry[] } = {},
): OkProvider {
  return {
    provider: name,
    label,
    data: {
      provider: name,
      updatedAt: '2026-09-07T15:00:00+08:00',
      current: parts.current === undefined ? current() : parts.current,
      hourly: parts.hourly ?? [],
      daily: parts.daily ?? [],
    },
  };
}

describe('alignHourly', () => {
  /*
   * 这是本文件最重要的一组用例。2026-09-07 实测:同一次请求里彩云的逐时从 15:00 开始、
   * 和风从 16:00 开始。参考实现(gemini 版)按数组下标配对,会把彩云 15:00 的温度
   * 和和风 16:00 的温度当成同一时刻 —— 整条曲线错位一小时,画出来完全看不出异常。
   */
  it('aligns by timestamp, not by array index, when the two feeds start at different hours', () => {
    const caiyun = provider('caiyun', '彩云天气', {
      hourly: [hour('2026-09-07T15:00+08:00', 28), hour('2026-09-07T16:00+08:00', 27)],
    });
    const qweather = provider('qweather', '和风天气', {
      hourly: [hour('2026-09-07T16:00+08:00', 26), hour('2026-09-07T17:00+08:00', 25)],
    });

    const { axis, series } = alignHourly([caiyun, qweather]);

    // 并集是三个时刻,而不是把两条两点序列硬凑成两个点
    expect(axis.map((t) => t.label)).toEqual(['15:00', '16:00', '17:00']);

    const cy = series.find((s) => s.provider === 'caiyun')!;
    const qw = series.find((s) => s.provider === 'qweather')!;

    // 关键断言:16:00 这一列必须是"彩云 27 / 和风 26",两个数都来自各自的 16:00。
    // 按下标配对会得到"彩云 28 / 和风 26"——那是把 15:00 和 16:00 摆在了一起
    expect(cy.temps).toEqual([28, 27, null]);
    expect(qw.temps).toEqual([null, 26, 25]);
  });

  it('leaves gaps as null so the line breaks instead of inventing a reading', () => {
    // 补值或拉平会让用户以为那家真的给了这个时刻的预报
    const a = provider('caiyun', '彩云天气', { hourly: [hour('2026-09-07T15:00+08:00', 28)] });
    const b = provider('qweather', '和风天气', { hourly: [hour('2026-09-07T18:00+08:00', 24)] });

    const { axis, series } = alignHourly([a, b]);

    expect(axis).toHaveLength(2);
    expect(series[0].temps).toEqual([28, null]);
    expect(series[1].temps).toEqual([null, 24]);
  });

  it('sorts the axis chronologically across a date boundary', () => {
    // 24 小时预报会跨天。键是 "YYYY-MM-DDTHH",字典序必须等于时间序 ——
    // 若只截 "HH" 排序,次日 01:00 会排到当天 23:00 前面
    const a = provider('caiyun', '彩云天气', {
      hourly: [hour('2026-09-07T23:00+08:00', 20), hour('2026-09-08T01:00+08:00', 18)],
    });

    const { axis } = alignHourly([a]);

    expect(axis.map((t) => t.hourKey)).toEqual(['2026-09-07T23', '2026-09-08T01']);
  });

  it('does not shift timestamps through Date parsing', () => {
    // 上游给的是带偏移的当地时间。走 new Date() 会转成 UTC,再取小时就偏 8 小时 ——
    // 这正是后端必须传 localTime=true 的同一个坑,前端不能在这里又踩一次
    const a = provider('caiyun', '彩云天气', { hourly: [hour('2026-09-07T15:00+08:00', 28)] });

    const { axis } = alignHourly([a]);

    expect(axis[0].label).toBe('15:00');
  });
});

describe('alignDaily', () => {
  it('aligns by date and keeps days only one provider covers', () => {
    // 天数不同是常态:实测和风 7 天、彩云 3 天(免费版差异)
    const caiyun = provider('caiyun', '彩云天气', { daily: [day('2026-09-07', 20, 28)] });
    const qweather = provider('qweather', '和风天气', {
      daily: [day('2026-09-07', 21, 29), day('2026-09-08', 18, 22)],
    });

    const rows = alignDaily([caiyun, qweather]);

    expect(rows.map((r) => r.date)).toEqual(['2026-09-07', '2026-09-08']);
    expect(rows[0].cells).toHaveLength(2);
    expect(rows[1].cells).toHaveLength(1);
  });

  it('reports no agreement for a day only one provider covers', () => {
    // 一家独有的预报没有"一致不一致"可谈。标成"高度一致"是错的 ——
    // 那会让用户以为两家都确认了这一天
    const caiyun = provider('caiyun', '彩云天气', { daily: [day('2026-09-07', 20, 28)] });
    const qweather = provider('qweather', '和风天气', {
      daily: [day('2026-09-07', 20, 28), day('2026-09-10', 18, 22)],
    });

    const rows = alignDaily([caiyun, qweather]);

    expect(rows.find((r) => r.date === '2026-09-07')!.agreement).toBe('high');
    expect(rows.find((r) => r.date === '2026-09-10')!.agreement).toBeNull();
  });

  it('grades agreement by the combined high/low spread', () => {
    const rowFor = (min: number, max: number) =>
      alignDaily([
        provider('caiyun', '彩云天气', { daily: [day('2026-09-07', 20, 28)] }),
        provider('qweather', '和风天气', { daily: [day('2026-09-07', min, max)] }),
      ])[0].agreement;

    // 极差合计 0 → 高度一致
    expect(rowFor(20, 28)).toBe('high');
    // 合计 4(最高温差 2 + 最低温差 2)→ 仍算高度一致(阈值是"大于 4")
    expect(rowFor(22, 30)).toBe('high');
    // 合计 6 → 基本吻合
    expect(rowFor(23, 31)).toBe('moderate');
    // 合计 8 → 分歧显著
    expect(rowFor(24, 32)).toBe('low');
  });

  it('drops to moderate when the temperatures match but the weather category differs', () => {
    // 温度一样但一家报晴一家报雨,这不是"高度一致"
    const rows = alignDaily([
      provider('caiyun', '彩云天气', { daily: [day('2026-09-07', 20, 28, '晴')] }),
      provider('qweather', '和风天气', { daily: [day('2026-09-07', 20, 28, '小雨')] }),
    ]);

    expect(rows[0].agreement).toBe('moderate');
  });
});

describe('buildConsensus', () => {
  const noHourly = { axis: [], series: [] };

  it('returns null when fewer than two providers have current data, so the card stays hidden', () => {
    const only = [
      provider('caiyun', '彩云天气'),
      provider('qweather', '和风天气', { current: null }),
    ];

    expect(buildConsensus(only, noHourly)).toBeNull();
  });

  it('reports high consensus when both feeds agree', () => {
    const result = buildConsensus(
      [provider('caiyun', '彩云天气'), provider('qweather', '和风天气')],
      noHourly,
    );

    expect(result?.level).toBe('high');
    expect(result?.tempNote).toContain('完全一致');
    expect(result?.rainNote).toContain('均判定当前无降水');
  });

  /*
   * 与参考实现的关键差异。gemini 版里 absTempDiff 只用来拼文案,从不参与
   * consensusStatus 判定 —— 温差 8° 但都说没雨时它输出"双源数据高度一致,
   * 预报可信度极高"。温差恰恰是这个产品最该报警的分歧。
   */
  it('flags divergence on temperature spread alone, even when both agree there is no rain', () => {
    const result = buildConsensus(
      [
        provider('caiyun', '彩云天气', { current: current({ tempC: 20, conditionText: '晴' }) }),
        provider('qweather', '和风天气', { current: current({ tempC: 28, conditionText: '晴' }) }),
      ],
      noHourly,
    );

    expect(result?.level).toBe('divergent');
    expect(result?.tempNote).toContain('8.0°');
    // 降水判定确实是一致的,这一栏不该报警
    expect(result?.rainNote).toContain('均判定当前无降水');
  });

  it('flags divergence when the providers disagree about rain', () => {
    const result = buildConsensus(
      [
        provider('caiyun', '彩云天气', { current: current({ conditionText: '小雨' }) }),
        provider('qweather', '和风天气', { current: current({ conditionText: '晴' }) }),
      ],
      noHourly,
    );

    expect(result?.level).toBe('divergent');
    expect(result?.rainNote).toContain('实况降水判定分歧');
  });

  /*
   * 由实测驱动的一条:2026-09-07 北京,两家实况都不是雨(彩云「晴」、和风「阴」)、
   * 温度只差 0.1°,单看这两项只能判到 moderate —— 但和风的逐时降水概率 68%
   * 而彩云 0%。"一家说要下雨、一家说不会"必须报分歧。
   */
  it('flags divergence when the providers disagree about upcoming rain, even if the current conditions match', () => {
    const forecast = alignHourly([
      provider('caiyun', '彩云天气', {
        hourly: [hour('2026-09-07T15:00+08:00', 28.9, 0), hour('2026-09-07T16:00+08:00', 27.9, 0)],
      }),
      provider('qweather', '和风天气', {
        hourly: [hour('2026-09-07T15:00+08:00', 29, 5), hour('2026-09-07T16:00+08:00', 27.5, 68)],
      }),
    ]);

    const result = buildConsensus(
      [
        provider('caiyun', '彩云天气', { current: current({ tempC: 28.9, conditionText: '晴' }) }),
        provider('qweather', '和风天气', { current: current({ tempC: 29, conditionText: '阴' }) }),
      ],
      forecast,
    );

    expect(result?.level).toBe('divergent');
    expect(result?.notes.join(' ')).toContain('16:00 的降水预报不一致');
    expect(result?.notes.join(' ')).toContain('68%');
    // 实况那一栏仍应如实说"都判定无降水" —— 分歧在预报里,不在实况里
    expect(result?.rainNote).toContain('均判定当前无降水');
  });

  it('does not call it a disagreement when only one provider has a probability for that hour', () => {
    // 单家数据无所谓一致不一致。两家覆盖的时间窗不重合时两端就是这种情况
    const forecast = alignHourly([
      provider('caiyun', '彩云天气', { hourly: [hour('2026-09-07T15:00+08:00', 28, 80)] }),
      provider('qweather', '和风天气', { hourly: [hour('2026-09-07T18:00+08:00', 26, 0)] }),
    ]);

    const result = buildConsensus(
      [provider('caiyun', '彩云天气'), provider('qweather', '和风天气')],
      forecast,
    );

    expect(result?.level).toBe('high');
  });

  it('treats a measurable precipitation amount as rain even when the text says otherwise', () => {
    const result = buildConsensus(
      [
        provider('caiyun', '彩云天气', { current: current({ conditionText: '阴', precipMm: 0.8 }) }),
        provider('qweather', '和风天气', { current: current({ conditionText: '阴', precipMm: 0 }) }),
      ],
      noHourly,
    );

    expect(result?.level).toBe('divergent');
    expect(result?.rainNote).toContain('降水判定分歧');
  });

  it('settles on moderate when the temperature gap is noticeable but under the divergence threshold', () => {
    const result = buildConsensus(
      [
        provider('caiyun', '彩云天气', { current: current({ tempC: 20 }) }),
        provider('qweather', '和风天气', { current: current({ tempC: 21.2 }) }),
      ],
      noHourly,
    );

    expect(result?.level).toBe('moderate');
  });

  it('mentions the differing condition texts so the user can see what each said', () => {
    const result = buildConsensus(
      [
        provider('caiyun', '彩云天气', { current: current({ conditionText: '晴' }) }),
        provider('qweather', '和风天气', { current: current({ conditionText: '阴' }) }),
      ],
      noHourly,
    );

    expect(result?.notes.join(' ')).toContain('彩云天气「晴」');
    expect(result?.notes.join(' ')).toContain('和风天气「阴」');
  });

  it('surfaces the first upcoming hour where rain probability picks up', () => {
    const hourly = alignHourly([
      provider('caiyun', '彩云天气', {
        hourly: [hour('2026-09-07T15:00+08:00', 28, 0), hour('2026-09-07T16:00+08:00', 27, 68)],
      }),
      provider('qweather', '和风天气', {
        hourly: [hour('2026-09-07T15:00+08:00', 28, 5), hour('2026-09-07T16:00+08:00', 27, 70)],
      }),
    ]);

    const result = buildConsensus(
      [provider('caiyun', '彩云天气'), provider('qweather', '和风天气')],
      hourly,
    );

    expect(result?.notes.join(' ')).toContain('16:00');
    expect(result?.notes.join(' ')).toContain('68%');
  });

  // 判定用极差而不是"两家之差",这样加第三家时不会静默只对比前两家
  it('uses the spread across all providers, so a third feed still counts', () => {
    const result = buildConsensus(
      [
        provider('caiyun', '彩云天气', { current: current({ tempC: 20 }) }),
        provider('qweather', '和风天气', { current: current({ tempC: 20 }) }),
        provider('seniverse' as ProviderName, '心知天气', { current: current({ tempC: 25 }) }),
      ],
      noHourly,
    );

    // 前两家完全一致,但第三家差 5° —— 必须报分歧
    expect(result?.level).toBe('divergent');
    expect(result?.tempNote).toContain('5.0°');
  });
});
