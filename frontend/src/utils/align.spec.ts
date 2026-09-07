import { alignHourly, type OkProvider } from './align';
import type { NormalizedCurrentWeather, NormalizedHourlyEntry, ProviderName } from '../types/weather';

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

function provider(
  name: ProviderName,
  label: string,
  parts: { current?: NormalizedCurrentWeather | null; hourly?: NormalizedHourlyEntry[] } = {},
): OkProvider {
  return {
    provider: name,
    label,
    data: {
      provider: name,
      updatedAt: '2026-09-07T15:00:00+08:00',
      current: parts.current === undefined ? current() : parts.current,
      hourly: parts.hourly ?? [],
      daily: [],
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
