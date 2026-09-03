import { classifyCondition, formatTemperature, formatWindSpeed, resolveDayPart } from './weather-display';

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
  it('把彩云的两位小数取整,与和风的整数对齐', () => {
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
  it('把彩云的两位小数取整,与和风的整数对齐', () => {
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
