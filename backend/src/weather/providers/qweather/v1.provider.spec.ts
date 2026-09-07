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
  // 单位取自 2026-09-07 实测:气压是 hPa、能见度是**米**、降水量是 mm
  precipitation: { amount: { value: 0, unit: 'mm' }, intensity: { value: 0, unit: 'mm/h' }, type: 'none' },
  pressure: { value: 1011.66, unit: 'hPa' },
  visibility: { value: 21850, unit: 'm' },
};

// 空气质量是独立接口的响应,形状与 /weather/v1/* 完全不同。
// indexes[] 按标准分条(这里同时给国标和美标,用来验证只取国标那条),
// pollutants[] 是各污染物浓度
const AIR_QUALITY_V1 = {
  indexes: [
    { code: 'cn-mee', name: 'AQI (CN)', aqi: 42, aqiDisplay: '42', level: '1', category: '优' },
    { code: 'us-epa', name: 'AQI (US)', aqi: 73, aqiDisplay: '73', level: '2', category: 'Moderate' },
  ],
  pollutants: [
    { code: 'pm2p5', name: 'PM 2.5', concentration: { value: 20, unit: 'μg/m³' } },
    { code: 'pm10', name: 'PM 10', concentration: { value: 38, unit: 'μg/m³' } },
  ],
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
      // 昼夜确实会不同 —— 2026-09-07 实测北京就是"小雨 / 中雨"
      nighttime: {
        condition: { text: '中雨', code: '306' },
      },
    },
  ],
};

// 顺序必须与 provider 里 Promise.allSettled 的数组顺序一致:current, hourly, daily, airQuality
function stubV1(
  overrides: { current?: unknown; hourly?: unknown; daily?: unknown; airQuality?: unknown } = {},
) {
  return vi
    .fn()
    .mockReturnValueOnce(of({ data: overrides.current ?? CURRENT_V1 }))
    .mockReturnValueOnce(of({ data: overrides.hourly ?? HOURLY_V1 }))
    .mockReturnValueOnce(of({ data: overrides.daily ?? DAILY_V1 }))
    .mockReturnValueOnce(of({ data: overrides.airQuality ?? AIR_QUALITY_V1 }));
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
      windDirectionDeg: 233,
      // 上游直接给的等级,不是我们换算的(彩云那边才需要换算)
      windScale: 2,
      pressureHpa: 1011.66,
      // 21850 m → 21.85 km
      visibilityKm: 21.85,
      precipMm: 0,
      airQuality: { aqi: 42, category: '优', pm25: 20 },
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
      {
        date: '2026-09-02',
        tempMinC: 5,
        tempMaxC: 15,
        conditionText: '晴',
        nightConditionText: '中雨',
        precipitationProbabilityPercent: 60,
      },
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
      windDirectionDeg: null,
      windScale: null,
      pressureHpa: null,
      visibilityKm: null,
      precipMm: null,
      // 这个 case 里空气质量子请求是成功的,所以整块不为 null;
      // 缺的是 current 自己的字段
      airQuality: { aqi: 42, category: '优', pm25: 20 },
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
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')))
      .mockReturnValueOnce(throwError(() => new Error('401 invalid key')));

    await expect(buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/401 invalid key/);
  });

  it('includes all three core failure reasons when every sub-request fails, not just the first', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('current failed')))
      .mockReturnValueOnce(throwError(() => new Error('hourly failed')))
      .mockReturnValueOnce(throwError(() => new Error('daily failed')))
      .mockReturnValueOnce(throwError(() => new Error('airquality failed')));

    await expect(buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(
      /current failed.*hourly failed.*daily failed/,
    );
  });

  // ---- 空气质量(独立接口,第 4 个子请求)----

  // 坐标顺序同样是 lat/lon,且这个接口不需要任何查询参数
  it('requests air quality from the dedicated v1 endpoint with lat/lon in the path', async () => {
    const getImpl = stubV1();

    await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    const airQualityCall = getImpl.mock.calls[3];
    expect(airQualityCall[0]).toBe('https://test.re.qweatherapi.com/airquality/v1/current/39.92/116.41');
    expect(airQualityCall[1].headers).toEqual({ 'X-QW-Api-Key': 'test-key' });
    expect(airQualityCall[1].params).toBeUndefined();
  });

  // indexes[] 里同时有国标和美标。彩云那边取的是 aqi.chn,这里必须取 cn-mee 才可比 ——
  // 取错标准会让两家的 AQI 差出几十点,而两个数字看起来都很合理
  it('reads the national (cn-mee) index rather than the US one', async () => {
    const result = await buildProvider(stubV1()).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.airQuality).toEqual({ aqi: 42, category: '优', pm25: 20 });
  });

  // 境外地点可能只返回美标。此时国标指数取不到,但 PM2.5 浓度不依赖指数标准,仍应给出
  it('keeps the PM2.5 concentration when the national index is absent', async () => {
    const getImpl = stubV1({
      airQuality: {
        indexes: [{ code: 'us-epa', aqi: 73, category: 'Moderate' }],
        pollutants: [{ code: 'pm2p5', concentration: { value: 20, unit: 'μg/m³' } }],
      },
    });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.airQuality).toEqual({ aqi: null, category: null, pm25: 20 });
  });

  // 空气质量只是一栏附加指标,它挂掉不该影响实况的温度/湿度/风速
  it('degrades air quality to null without touching the rest of the current weather', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(of({ data: CURRENT_V1 }))
      .mockReturnValueOnce(of({ data: HOURLY_V1 }))
      .mockReturnValueOnce(of({ data: DAILY_V1 }))
      .mockReturnValueOnce(throwError(() => new Error('airquality 429 rate limited')));

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.airQuality).toBeNull();
    expect(result.current?.tempC).toBe(9.4);
    expect(result.current?.humidityPercent).toBe(35);
    expect(result.hourly).toHaveLength(1);
  });

  // 反过来:空气质量单独成功、三个核心请求全挂时,这家仍必须判为不可用。
  // 一张只有 AQI、没有温度和天气的卡片对用户没有任何意义
  it('still rejects when only air quality succeeds and all three core requests fail', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('current failed')))
      .mockReturnValueOnce(throwError(() => new Error('hourly failed')))
      .mockReturnValueOnce(throwError(() => new Error('daily failed')))
      .mockReturnValueOnce(of({ data: AIR_QUALITY_V1 }));

    await expect(buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(
      /和风天气请求全部失败/,
    );
  });

  // ---- 能见度与气压的单位换算 ----

  // v1 给的是米(实测 21850),契约是 km
  it('converts visibility from metres into the km the contract requires', async () => {
    const result = await buildProvider(stubV1()).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.visibilityKm).toBe(21.85);
  });

  it('leaves visibility untouched when the upstream already reports km', async () => {
    const getImpl = stubV1({ current: { ...CURRENT_V1, visibility: { value: 21.85, unit: 'km' } } });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.visibilityKm).toBe(21.85);
  });

  // 与风速同一个道理:未知单位说明上游变了,报 null 好过静默错 1000 倍
  it('reports null rather than a wrong number when the visibility unit is unrecognized', async () => {
    const getImpl = stubV1({ current: { ...CURRENT_V1, visibility: { value: 13, unit: 'mi' } } });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.visibilityKm).toBeNull();
  });

  // v1 现在给 hPa,与契约同单位。这个 case 防的是上游改成 Pa —— 彩云给的就是 Pa,
  // 两者差 100 倍,静默算错会让气压显示成 101166 hPa
  it('converts pressure from Pa into hPa if the upstream ever switches units', async () => {
    const getImpl = stubV1({ current: { ...CURRENT_V1, pressure: { value: 101166, unit: 'Pa' } } });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.pressureHpa).toBe(1011.66);
  });

  it('reports null rather than a wrong number when the pressure unit is unrecognized', async () => {
    const getImpl = stubV1({ current: { ...CURRENT_V1, pressure: { value: 29.9, unit: 'inHg' } } });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.pressureHpa).toBeNull();
  });

  // ---- 逐日的昼夜天气 ----

  // 拿不到夜间段就如实为 null,不能拿白天的值冒充 —— 那会造出"昼夜相同"的假象
  it('leaves the night condition null instead of reusing the daytime one', async () => {
    const getImpl = stubV1({
      daily: { days: [{ ...DAILY_V1.days[0], nighttime: undefined }] },
    });

    const result = await buildProvider(getImpl).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.daily[0].conditionText).toBe('晴');
    expect(result.daily[0].nightConditionText).toBeNull();
  });
});
