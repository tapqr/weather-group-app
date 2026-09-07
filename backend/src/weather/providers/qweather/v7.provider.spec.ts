import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { QWeatherV7Provider } from './v7.provider.js';

function buildProvider(getImpl: Mock) {
  const httpService = { get: getImpl } as any;
  const configService = {
    get: (key: string) =>
      ({
        'qweather.apiHost': 'test.re.qweatherapi.com',
        'qweather.apiKey': 'test-key',
      })[key],
  } as any;
  return new QWeatherV7Provider(httpService, configService);
}

describe('QWeatherV7Provider', () => {
  it('normalizes current, hourly, and daily data from QWeather v7 responses', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(
        of({
          data: {
            code: '200',
            // v7 的所有数值都是字符串。这些新字段是按 v7 文档写的 ——
            // v7 已被上游停用(实测 /v7/air/now 返回 403 Deprecated),无法实测核对
            now: {
              temp: '9',
              feelsLike: '7',
              text: '晴',
              humidity: '35',
              windSpeed: '12',
              wind360: '233',
              windScale: '2',
              precip: '0.0',
              pressure: '1011',
              vis: '21',
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            code: '200',
            hourly: [{ fxTime: '2026-09-02T15:00+08:00', temp: '10', text: '多云', pop: '20' }],
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            code: '200',
            daily: [
              { fxDate: '2026-09-02', tempMax: '15', tempMin: '5', textDay: '晴', textNight: '多云' },
            ],
          },
        }),
      );

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.provider).toBe('qweather');
    expect(result.current).toEqual({
      tempC: 9,
      feelsLikeC: 7,
      conditionText: '晴',
      // v7 的 humidity 是 0~100 整数(v1 是 0~1 小数),不换算
      humidityPercent: 35,
      // v7 的 windSpeed 单位就是 km/h(v1 是 m/s),不换算
      windSpeedKph: 12,
      windDirectionDeg: 233,
      windScale: 2,
      pressureHpa: 1011,
      // v7 的 vis 单位是 km(v1 是米),不换算
      visibilityKm: 21,
      precipMm: 0,
      // v7 的空气质量接口已被上游停用,如实为 null —— 不填常量冒充实时数据
      airQuality: null,
    });
    expect(result.hourly).toEqual([
      { time: '2026-09-02T15:00+08:00', tempC: 10, conditionText: '多云', precipitationProbabilityPercent: 20 },
    ]);
    expect(result.daily).toEqual([
      {
        date: '2026-09-02',
        tempMinC: 5,
        tempMaxC: 15,
        conditionText: '晴',
        nightConditionText: '多云',
        precipitationProbabilityPercent: null,
      },
    ]);

    const [, , dailyCallArgs] = getImpl.mock.calls;
    expect(dailyCallArgs[0]).toBe('https://test.re.qweatherapi.com/v7/weather/7d');
    expect(dailyCallArgs[1].params.location).toBe('116.41,39.92');
    expect(dailyCallArgs[1].headers).toEqual({ 'X-QW-Api-Key': 'test-key' });
  });

  it('falls back to null/empty when a sub-request fails, without throwing', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(
        of({
          data: { code: '200', now: { temp: '9', text: '晴', feelsLike: '7', humidity: '35', windSpeed: '12' } },
        }),
      )
      .mockReturnValueOnce(throwError(() => new Error('network timeout')))
      .mockReturnValueOnce(of({ data: { code: '200', daily: [] } }));

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

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

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/401 invalid key/);
  });

  it('includes all three sub-request failure reasons when every sub-request fails, not just the first', async () => {
    const getImpl = vi
      .fn()
      .mockReturnValueOnce(throwError(() => new Error('now failed')))
      .mockReturnValueOnce(throwError(() => new Error('24h failed')))
      .mockReturnValueOnce(throwError(() => new Error('7d failed')));

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(
      /now failed.*24h failed.*7d failed/,
    );
  });
});

describe('QWeatherV7Provider 字符串数值解析', () => {
  function stubNow(now: Record<string, unknown>) {
    return vi
      .fn()
      .mockReturnValueOnce(of({ data: { code: '200', now: { temp: '9', text: '晴', ...now } } }))
      .mockReturnValueOnce(of({ data: { code: '200', hourly: [] } }))
      .mockReturnValueOnce(of({ data: { code: '200', daily: [] } }));
  }

  // v7 的数值是字符串,直接 Number(undefined) 会得到 NaN。NaN 会被 JSON 序列化成 null,
  // 看起来"碰巧对了",但它在参与任何计算前都是个隐患 —— 前端要拿它算温差和分歧
  it('把缺失字段解析成 null 而不是 NaN', async () => {
    const result = await buildProvider(stubNow({})).getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.pressureHpa).toBeNull();
    expect(result.current?.visibilityKm).toBeNull();
    expect(result.current?.windScale).toBeNull();
    expect(result.current?.windDirectionDeg).toBeNull();
    expect(result.current?.precipMm).toBeNull();
  });

  it('把空字符串也当作缺失,而不是 0', async () => {
    // 上游用空串表示"无数据"时,Number('') 是 0 —— 会把"没测到降水量"
    // 显示成"降水量 0mm",两者对用户的含义完全不同
    const result = await buildProvider(stubNow({ precip: '', pressure: '  ' })).getForecast({
      lat: 39.92,
      lon: 116.41,
    });

    expect(result.current?.precipMm).toBeNull();
    expect(result.current?.pressureHpa).toBeNull();
  });

  it('保留 0 这个真实观测值,不把它误判成缺失', async () => {
    // 与上一条相对:降水量真的是 0 时必须是 0,不能因为 0 是 falsy 就变成 null
    const result = await buildProvider(stubNow({ precip: '0', windScale: '0' })).getForecast({
      lat: 39.92,
      lon: 116.41,
    });

    expect(result.current?.precipMm).toBe(0);
    expect(result.current?.windScale).toBe(0);
  });
});
