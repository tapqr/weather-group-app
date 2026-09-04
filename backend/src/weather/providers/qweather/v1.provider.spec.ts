import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { QWeatherV1Provider } from './v1.provider.js';

function buildProvider(getImpl: Mock) {
  const httpService = { get: getImpl } as any;
  const configService = {
    get: (key: string) =>
      ({
        'qweather.apiHost': 'test.re.qweatherapi.com',
        'qweather.apiKey': 'test-key',
      })[key],
  } as any;
  return new QWeatherV1Provider(httpService, configService);
}

// 取自真实 v1 响应,只保留归一化用得上的字段
const CURRENT_V1 = {
  condition: { text: '晴', code: '100' },
  temperature: { value: 9.4, unit: '°C' },
  feelsLike: { value: 7.2, unit: '°C' },
  humidity: 0.35,
  wind: { direction: { degree: 233, compass: 'sw' }, speed: { value: 2.5, unit: 'm/s' }, scale: 2 },
};

const HOURLY_V1 = {
  hours: [
    {
      forecastTime: '2026-09-02T15:00+08:00',
      condition: { text: '多云', code: '101' },
      temperature: { value: 10, unit: '°C' },
      precipitation: { amount: { value: 0, unit: 'mm' }, probability: 0.2, type: 'none' },
    },
  ],
};

const DAILY_V1 = {
  days: [
    {
      forecastStartTime: '2026-09-02T00:00+08:00',
      forecastEndTime: '2026-09-03T00:00+08:00',
      temperatureMax: { value: 15, unit: '°C' },
      temperatureMin: { value: 5, unit: '°C' },
      daytime: {
        condition: { text: '晴', code: '100' },
        precipitation: { amount: { value: 0, unit: 'mm' }, probability: 0.6, type: 'none' },
      },
    },
  ],
};

function stubV1(overrides: { current?: unknown; hourly?: unknown; daily?: unknown } = {}) {
  return vi
    .fn()
    .mockReturnValueOnce(of({ data: overrides.current ?? CURRENT_V1 }))
    .mockReturnValueOnce(of({ data: overrides.hourly ?? HOURLY_V1 }))
    .mockReturnValueOnce(of({ data: overrides.daily ?? DAILY_V1 }));
}

describe('QWeatherV1Provider', () => {
  it('calls the v1 endpoints with the API key header, coordinates in the path', async () => {
    const getImpl = stubV1();

    await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    const [currentCall, hourlyCall, dailyCall] = getImpl.mock.calls;
    expect(currentCall[0]).toBe('https://test.re.qweatherapi.com/weather/v1/current/39.92/116.41');
    expect(hourlyCall[0]).toBe('https://test.re.qweatherapi.com/weather/v1/hourly/39.92/116.41');
    expect(dailyCall[0]).toBe('https://test.re.qweatherapi.com/weather/v1/daily/39.92/116.41');
    expect(dailyCall[1].headers).toEqual({ 'X-QW-Api-Key': 'test-key' });
  });

  // v1 的路径参数最多两位小数,而 /weather 收到的坐标可能更精确
  it('rounds coordinates to the two decimals the v1 path accepts', async () => {
    const getImpl = stubV1();

    await buildProvider(getImpl).getForecast({ lat: 39.9042, lon: 116.4074 });

    expect(getImpl.mock.calls[0][0]).toBe('https://test.re.qweatherapi.com/weather/v1/current/39.9/116.41');
  });

  // v1 默认返回 UTC 时间戳,不加 localTime 逐小时会整体偏 8 小时、逐天日期会退一天
  it('asks for local time so forecast timestamps keep the upstream local offset', async () => {
    const getImpl = stubV1();

    await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    const [, hourlyCall, dailyCall] = getImpl.mock.calls;
    expect(hourlyCall[1].params).toMatchObject({ localTime: true });
    expect(dailyCall[1].params).toMatchObject({ localTime: true });
  });

  it('normalizes the v1 current response', async () => {
    const result = await buildProvider(stubV1()).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.provider).toBe('qweather');
    expect(result.current).toEqual({
      tempC: 9.4,
      feelsLikeC: 7.2,
      conditionText: '晴',
      humidityPercent: 35,
      windSpeedKph: 9,
    });
  });

  // v1 的 humidity 是 0~1 小数,v7 是 0~100 —— 照抄会让湿度全变 0%
  it('converts the 0-1 humidity of v1 into a percentage', async () => {
    const getImpl = stubV1({ current: { ...CURRENT_V1, humidity: 0.07 } });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.humidityPercent).toBe(7);
  });

  // v1 报 m/s(v7 报 km/h),对外契约是 km/h
  it('converts wind speed from m/s into the km/h the contract requires', async () => {
    const getImpl = stubV1({
      current: { ...CURRENT_V1, wind: { ...CURRENT_V1.wind, speed: { value: 10, unit: 'm/s' } } },
    });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.windSpeedKph).toBe(36);
  });

  // 单位换算按 unit 字段走,而不是写死 ×3.6 —— 上游改单位制时不能静默错 3.6 倍
  it('leaves wind speed untouched when the upstream already reports km/h', async () => {
    const getImpl = stubV1({
      current: { ...CURRENT_V1, wind: { ...CURRENT_V1.wind, speed: { value: 10, unit: 'km/h' } } },
    });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.windSpeedKph).toBe(10);
  });

  // v1 文档写明单位固定为公制且无 unit 参数,出现意外单位就说明上游变了 ——
  // 此时报 null(前端显示"—")好过把一个未知单位的数字当成 km/h 报出去
  it('reports null rather than a wrong number when the wind unit is unrecognized', async () => {
    const getImpl = stubV1({
      current: { ...CURRENT_V1, wind: { ...CURRENT_V1.wind, speed: { value: 10, unit: 'mph' } } },
    });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.windSpeedKph).toBeNull();
  });

  it('normalizes the v1 hourly response', async () => {
    const result = await buildProvider(stubV1()).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.hourly).toEqual([
      { time: '2026-09-02T15:00+08:00', tempC: 10, conditionText: '多云', precipitationProbabilityPercent: 20 },
    ]);
  });

  // v1 的 daily 有降水概率(v7 没有),取白天段;日期从 forecastStartTime 截,契约要 YYYY-MM-DD
  it('normalizes the v1 daily response, taking date and condition from the daytime segment', async () => {
    const result = await buildProvider(stubV1()).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.daily).toEqual([
      { date: '2026-09-02', tempMinC: 5, tempMaxC: 15, conditionText: '晴', precipitationProbabilityPercent: 60 },
    ]);
  });

  it('marks optional fields null when v1 omits them, instead of emitting NaN', async () => {
    const getImpl = stubV1({
      current: { condition: { text: '晴' }, temperature: { value: 9, unit: '°C' } },
    });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current).toEqual({
      tempC: 9,
      feelsLikeC: null,
      conditionText: '晴',
      humidityPercent: null,
      windSpeedKph: null,
    });
  });

  it('falls back to null/empty when a sub-request fails, without throwing', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(of({ data: CURRENT_V1 }))
      .mockReturnValueOnce(throwError(() => new Error('network timeout')))
      .mockReturnValueOnce(of({ data: { days: [] } }));

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current).not.toBeNull();
    expect(result.hourly).toEqual([]);
    expect(result.daily).toEqual([]);
  });

  it('rejects when every sub-request fails, so the aggregator can mark the provider unavailable', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')))
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')))
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')));

    await expect(buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/401 invalid key/);
  });

  it('includes all three sub-request failure reasons when every sub-request fails, not just the first', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('current failed')))
      .mockReturnValueOnce(throwError(() => new Error('hourly failed')))
      .mockReturnValueOnce(throwError(() => new Error('daily failed')));

    await expect(buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(
      /current failed.*hourly failed.*daily failed/,
    );
  });
});
