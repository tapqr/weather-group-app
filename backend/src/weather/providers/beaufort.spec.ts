import { kphToBeaufortScale } from './beaufort.js';

describe('kphToBeaufortScale', () => {
  it('maps each standard Beaufort band to its level', () => {
    // 逐档取一个带内值,确认没有整档错位
    const samples: Array<[number, number]> = [
      [0, 0],
      [0.9, 0],
      [3, 1],
      [8, 2],
      [15, 3],
      [24, 4],
      [33, 5],
      [44, 6],
      [55, 7],
      [68, 8],
      [80, 9],
      [95, 10],
      [110, 11],
      [130, 12],
    ];
    for (const [kph, expected] of samples) {
      expect(kphToBeaufortScale(kph)).toBe(expected);
    }
  });

  it('treats each boundary value as belonging to the lower level', () => {
    // 上界本身归入低一级 —— 5 km/h 是 1 级的上界,不能溢出成 2 级
    expect(kphToBeaufortScale(1)).toBe(0);
    expect(kphToBeaufortScale(5)).toBe(1);
    expect(kphToBeaufortScale(11)).toBe(2);
    expect(kphToBeaufortScale(117)).toBe(11);
    expect(kphToBeaufortScale(117.1)).toBe(12);
  });

  it('reproduces the scale QWeather itself reports for the same speed', () => {
    // 换算表的上游印证:2026-09-07 实测北京和风 current 同时给出
    // wind.speed = 4.2 m/s(= 15.12 km/h)和 wind.scale = 3。
    // 我们的换算表对 15.12 km/h 也给 3 级 —— 说明这张表和上游用的是同一套标准。
    expect(kphToBeaufortScale(4.2 * 3.6)).toBe(3);

    // 同一时刻彩云给的是 7.76 km/h → 2 级。和风 3 级、彩云 2 级的差异来自
    // **两家测到的风速本来就不同**(15.12 vs 7.76),不是换算边界造成的。
    expect(kphToBeaufortScale(7.76)).toBe(2);
  });

  it('returns null rather than level 0 when the speed is missing or nonsensical', () => {
    // 0 级是"无风"这个真实观测,和"没数据"必须分开 —— 否则前端会把缺失显示成无风
    expect(kphToBeaufortScale(null)).toBeNull();
    expect(kphToBeaufortScale(Number.NaN)).toBeNull();
    expect(kphToBeaufortScale(Number.POSITIVE_INFINITY)).toBeNull();
    expect(kphToBeaufortScale(-1)).toBeNull();
    expect(kphToBeaufortScale(0)).toBe(0);
  });
});
