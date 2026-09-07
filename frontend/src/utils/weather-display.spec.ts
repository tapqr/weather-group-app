import {
  classifyCondition,
  formatPrecip,
  formatPressure,
  formatTemperature,
  formatVisibility,
  formatWindDirection,
  formatWindScale,
  formatWindSpeed,
  resolveDayPart,
} from './weather-display';

describe('classifyCondition', () => {
  // 彩云的 20 项文案已确认与官方 skycon 枚举一一对应(2026-09-03 核查),
  // 全部喂一遍,确保没有一项落到兜底分支
  it.each([
    ['晴', 'clear'],
    ['多云', 'cloudy'],
    ['阴', 'cloudy'],
    ['轻度雾霾', 'haze'],
    ['中度雾霾', 'haze'],
    ['重度雾霾', 'haze'],
    ['小雨', 'rain'],
    ['中雨', 'rain'],
    ['大雨', 'rain'],
    ['暴雨', 'rain'],
    ['雾', 'haze'],
    ['小雪', 'snow'],
    ['中雪', 'snow'],
    ['大雪', 'snow'],
    ['暴雪', 'snow'],
    ['浮尘', 'haze'],
    ['沙尘', 'haze'],
    ['大风', 'wind'],
  ])('把彩云文案 %s 归类为 %s', (text, expected) => {
    expect(classifyCondition(text)).toBe(expected);
  });

  // 和风是直接透传上游 text 字段,取值不受控,这里覆盖官方文案表里的常见项
  it.each([
    ['少云', 'cloudy'],
    ['晴间多云', 'cloudy'],
    ['阵雨', 'rain'],
    ['雷阵雨', 'rain'],
    ['小到中雨', 'rain'],
    ['雨夹雪', 'snow'],
    ['阵雪', 'snow'],
    ['霾', 'haze'],
    ['薄雾', 'haze'],
    ['扬沙', 'haze'],
  ])('把和风文案 %s 归类为 %s', (text, expected) => {
    expect(classifyCondition(text)).toBe(expected);
  });

  it('雨夹雪归到雪,因为视觉上雪的辨识度更高', () => {
    expect(classifyCondition('雨夹雪')).toBe('snow');
  });

  it('晴间多云归到多云,而不是晴', () => {
    expect(classifyCondition('晴间多云')).toBe('cloudy');
  });

  it('无法识别的文案落到 unknown 兜底', () => {
    expect(classifyCondition('龙卷风警报')).toBe('wind');
    expect(classifyCondition('未知天象')).toBe('unknown');
    expect(classifyCondition('')).toBe('unknown');
  });
});

describe('resolveDayPart', () => {
  const at = (hour: number, minute = 0) => new Date(2026, 8, 3, hour, minute);

  it.each([
    [7, 'day'],
    [12, 'day'],
    [16, 'day'],
  ])('%s 点是白天', (hour, expected) => {
    expect(resolveDayPart(at(hour))).toBe(expected);
  });

  it.each([
    [5, 'twilight'],
    [6, 'twilight'],
    [17, 'twilight'],
    [18, 'twilight'],
  ])('%s 点是晨昏', (hour, expected) => {
    expect(resolveDayPart(at(hour))).toBe(expected);
  });

  it.each([
    [19, 'night'],
    [23, 'night'],
    [0, 'night'],
    [4, 'night'],
  ])('%s 点是夜晚', (hour, expected) => {
    expect(resolveDayPart(at(hour))).toBe(expected);
  });

  it('按整点边界切换,分钟不影响判定', () => {
    expect(resolveDayPart(at(6, 59))).toBe('twilight');
    expect(resolveDayPart(at(7, 0))).toBe('day');
    expect(resolveDayPart(at(16, 59))).toBe('day');
    expect(resolveDayPart(at(17, 0))).toBe('twilight');
    expect(resolveDayPart(at(18, 59))).toBe('twilight');
    expect(resolveDayPart(at(19, 0))).toBe('night');
  });
});

describe('formatTemperature', () => {
  it('把两家的两位小数取整', () => {
    expect(formatTemperature(24.56)).toBe('25');
    expect(formatTemperature(25)).toBe('25');
  });

  it('向下取整的一侧同样按四舍五入', () => {
    expect(formatTemperature(24.4)).toBe('24');
    expect(formatTemperature(20.9)).toBe('21');
  });

  it('负零不能显示成 -0', () => {
    expect(formatTemperature(-0.4)).toBe('0');
    expect(formatTemperature(-0.01)).toBe('0');
  });

  it('负温度正常取整', () => {
    expect(formatTemperature(-3.6)).toBe('-4');
    expect(formatTemperature(-7)).toBe('-7');
  });

  it('缺失的数值显示成占位符,而不是 undefined 或 NaN', () => {
    expect(formatTemperature(null)).toBe('—');
  });
});

describe('formatWindSpeed', () => {
  it('把两家的两位小数取整', () => {
    expect(formatWindSpeed(1.77)).toBe('2');
    expect(formatWindSpeed(9)).toBe('9');
  });

  it('小于 1 的微风取整后仍是有意义的值,不显示成空', () => {
    expect(formatWindSpeed(0.63)).toBe('1');
    expect(formatWindSpeed(0.2)).toBe('0');
  });

  it('缺失时显示占位符', () => {
    expect(formatWindSpeed(null)).toBe('—');
  });
});

describe('formatWindDirection', () => {
  it('maps degrees to the eight compass points', () => {
    expect(formatWindDirection(0)).toBe('北风');
    expect(formatWindDirection(45)).toBe('东北风');
    expect(formatWindDirection(90)).toBe('东风');
    expect(formatWindDirection(135)).toBe('东南风');
    expect(formatWindDirection(180)).toBe('南风');
    expect(formatWindDirection(225)).toBe('西南风');
    expect(formatWindDirection(270)).toBe('西风');
    expect(formatWindDirection(315)).toBe('西北风');
  });

  it('wraps around so degrees just under 360 read as north', () => {
    // 350° 和 10° 都该落回"北",不能因为 350/45 = 7.8 就跑到"西北"
    expect(formatWindDirection(350)).toBe('北风');
    expect(formatWindDirection(359)).toBe('北风');
    expect(formatWindDirection(10)).toBe('北风');
    expect(formatWindDirection(360)).toBe('北风');
  });

  it('agrees with the compass names QWeather reports for the same degrees', () => {
    // 2026-09-07 实测和风同时给了 degree 和 compass,用它交叉验证:
    //   degree 233 / compass "sw"、degree 58 / compass "ene"
    // ene 属于 16 方位制,在 8 方位制下归入东北 —— 这正是不用上游 compass 的原因:
    // 一家用 compass、一家用角度换算,两家分档口径就不一样了
    expect(formatWindDirection(233)).toBe('西南风');
    expect(formatWindDirection(58)).toBe('东北风');
  });

  it('handles degrees outside the 0-360 range instead of producing undefined', () => {
    expect(formatWindDirection(-90)).toBe('西风');
    expect(formatWindDirection(450)).toBe('东风');
  });

  it('reports an em dash when the direction is missing', () => {
    expect(formatWindDirection(null)).toBe('—');
    expect(formatWindDirection(Number.NaN)).toBe('—');
  });
});

describe('formatPressure / formatVisibility', () => {
  it('rounds away the precision that unit conversion introduced', () => {
    // 1004.9758 是彩云的帕值 ÷100 的产物;21.85 是和风的米值 ÷1000。
    // 小数位是换算副产品,不是精度
    expect(formatPressure(1004.9758)).toBe('1005');
    expect(formatPressure(1011.66)).toBe('1012');
    expect(formatVisibility(20.15)).toBe('20');
    expect(formatVisibility(21.85)).toBe('22');
  });

  it('reports an em dash when the reading is missing', () => {
    expect(formatPressure(null)).toBe('—');
    expect(formatVisibility(null)).toBe('—');
  });
});

describe('formatPrecip', () => {
  it('keeps one decimal so a drizzle is not rounded down to nothing', () => {
    // 这里刻意与温度/风速的取整策略不同:降水量常在 0~1 之间,
    // 取整会把"0.4mm 的小雨"和"没下雨"显示成同一个数
    expect(formatPrecip(0.4)).toBe('0.4');
    expect(formatPrecip(0)).toBe('0.0');
    expect(formatPrecip(12.34)).toBe('12.3');
  });

  it('reports an em dash when the reading is missing', () => {
    expect(formatPrecip(null)).toBe('—');
  });
});

describe('formatWindScale', () => {
  it('shows force 0 as a real reading, not as missing data', () => {
    // 0 级是"无风"这个观测结果;后端在拿不到风速时给的是 null。两者含义完全不同
    expect(formatWindScale(0)).toBe('0');
    expect(formatWindScale(3)).toBe('3');
    expect(formatWindScale(null)).toBe('—');
  });
});
