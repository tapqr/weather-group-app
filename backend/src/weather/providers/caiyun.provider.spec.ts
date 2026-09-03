import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { CaiyunProvider } from './caiyun.provider.js';

function buildProvider(getImpl: Mock) {
  const httpService = { get: getImpl } as any;
  const configService = { get: () => 'test-token' } as any;
  return new CaiyunProvider(httpService, configService);
}

describe('CaiyunProvider', () => {
  it('normalizes the combined weather response, converting skycon codes and truncating daily dates to YYYY-MM-DD', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({
        data: {
          status: 'ok',
          result: {
            realtime: {
              temperature: 9,
              apparent_temperature: 7,
              humidity: 0.35,
              skycon: 'CLEAR_DAY',
              wind: { speed: 2 },
            },
            hourly: {
              temperature: [{ datetime: '2026-09-02T15:00+08:00', value: 10 }],
              skycon: [{ datetime: '2026-09-02T15:00+08:00', value: 'PARTLY_CLOUDY_DAY' }],
              precipitation: [{ datetime: '2026-09-02T15:00+08:00', value: 0, probability: 20 }],
            },
            daily: {
              // 彩云天气真实返回的是带时间和时区偏移的 ISO 字符串,不是纯日期
              temperature: [{ date: '2026-09-02T00:00+08:00', max: 15, min: 5 }],
              skycon: [{ date: '2026-09-02T00:00+08:00', value: 'CLEAR_DAY' }],
              precipitation: [{ date: '2026-09-02T00:00+08:00', probability: 10 }],
            },
          },
        },
      }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.provider).toBe('caiyun');
    expect(result.current).toEqual({
      tempC: 9,
      feelsLikeC: 7,
      conditionText: '晴',
      humidityPercent: 35,
      // 彩云天气在 metric:v2 下风速单位已经是 km/h,应直接透传,不应再乘 3.6
      windSpeedKph: 2,
    });
    expect(result.hourly).toEqual([
      { time: '2026-09-02T15:00+08:00', tempC: 10, conditionText: '多云', precipitationProbabilityPercent: 20 },
    ]);
    expect(result.daily).toEqual([
      { date: '2026-09-02', tempMinC: 5, tempMaxC: 15, conditionText: '晴', precipitationProbabilityPercent: 10 },
    ]);

    const [callArgs] = getImpl.mock.calls;
    // URL 路径里经纬度顺序是 "经度,纬度"(和响应体 JSON 里的 [纬度,经度] 相反)
    expect(callArgs[0]).toBe('https://api.caiyunapp.com/v2.6/test-token/116.41,39.92/weather');
  });

  it('rejects when the combined request fails, so the aggregator can mark the provider unavailable', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => new Error('network timeout')));

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/network timeout/);
  });

  it('rounds humidity to whole percent (regression: catches floating-point precision errors)', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({
        data: {
          status: 'ok',
          result: {
            realtime: {
              temperature: 12,
              apparent_temperature: 10,
              humidity: 0.29, // Would yield 28.999999999999996 without rounding
              skycon: 'CLOUDY',
              wind: { speed: 1 },
            },
            hourly: {
              temperature: [{ datetime: '2026-09-02T16:00+08:00', value: 11 }],
              skycon: [{ datetime: '2026-09-02T16:00+08:00', value: 'CLOUDY' }],
              precipitation: [{ datetime: '2026-09-02T16:00+08:00', value: 0, probability: 0 }],
            },
            daily: {
              temperature: [{ date: '2026-09-02', max: 16, min: 8 }],
              skycon: [{ date: '2026-09-02', value: 'CLOUDY' }],
              precipitation: [{ date: '2026-09-02', probability: 5 }],
            },
          },
        },
      }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    // Humidity 0.29 * 100 must be exactly 29, not 28.999999999999996
    expect(result.current?.humidityPercent).toBe(29);
  });

  it('does not throw when the skycon array is shorter than the temperature array (regression: missing bounds check)', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({
        data: {
          status: 'ok',
          result: {
            realtime: {
              temperature: 12,
              apparent_temperature: 10,
              humidity: 0.5,
              skycon: 'CLOUDY',
              wind: { speed: 1 },
            },
            hourly: {
              temperature: [
                { datetime: '2026-09-02T16:00+08:00', value: 11 },
                { datetime: '2026-09-02T17:00+08:00', value: 12 },
              ],
              // shorter than `temperature` on purpose: index 1 is out of bounds
              skycon: [{ datetime: '2026-09-02T16:00+08:00', value: 'CLOUDY' }],
              precipitation: [{ datetime: '2026-09-02T16:00+08:00', value: 0, probability: 0 }],
            },
            daily: {
              temperature: [
                { date: '2026-09-02T00:00+08:00', max: 16, min: 8 },
                { date: '2026-09-03T00:00+08:00', max: 17, min: 9 },
              ],
              // shorter than `temperature` on purpose: index 1 is out of bounds
              skycon: [{ date: '2026-09-02T00:00+08:00', value: 'CLOUDY' }],
              precipitation: [{ date: '2026-09-02T00:00+08:00', probability: 5 }],
            },
          },
        },
      }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.hourly[1].conditionText).toBe('');
    expect(result.daily[1].conditionText).toBe('');
    // The in-bounds entries are still fully populated
    expect(result.hourly[0].conditionText).toBe('阴');
    expect(result.daily[0].conditionText).toBe('阴');
  });
});

describe('CaiyunProvider 响应体校验', () => {
  it('把上游给的失败原因抛出来,而不是让解构崩溃成无意义的 TypeError', async () => {
    // 文档(tables/errors.html)明确失败时返回这个结构
    const getImpl = vi.fn().mockReturnValueOnce(
      of({ data: { status: 'failed', error: 'token is invalid', api_version: 'v2.6' } }),
    );

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/token is invalid/);
  });

  it('status 不是 ok 且没有 error 字段时,至少把 status 带进错误信息', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { status: 'failed' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/failed/);
  });

  it('status 是 ok 但 result 缺失时也要报错,不能继续往下解构', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { status: 'ok' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/彩云天气/);
  });
});

describe('CaiyunProvider 按块降级', () => {
  const realtimeBlock = {
    temperature: 20,
    apparent_temperature: 19,
    humidity: 0.6,
    skycon: 'CLEAR_DAY',
    wind: { speed: 3 },
  };
  const dailyBlock = {
    temperature: [{ date: '2026-09-03T00:00+08:00', max: 30, min: 20 }],
    skycon: [{ date: '2026-09-03T00:00+08:00', value: 'CLEAR_DAY' }],
    precipitation: [{ date: '2026-09-03T00:00+08:00', probability: 0 }],
  };
  const hourlyBlock = {
    temperature: [{ datetime: '2026-09-03T15:00+08:00', value: 25 }],
    skycon: [{ datetime: '2026-09-03T15:00+08:00', value: 'CLEAR_DAY' }],
    precipitation: [{ datetime: '2026-09-03T15:00+08:00', value: 0, probability: 0 }],
  };

  const ok = (result: unknown) => vi.fn().mockReturnValueOnce(of({ data: { status: 'ok', result } }));

  it('hourly 整块缺失时,实况和日预报照常返回', async () => {
    const provider = buildProvider(ok({ realtime: realtimeBlock, daily: dailyBlock }));

    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.tempC).toBe(20);
    expect(result.daily).toHaveLength(1);
    expect(result.hourly).toEqual([]);
  });

  it('daily 整块缺失时,实况和逐时照常返回', async () => {
    const provider = buildProvider(ok({ realtime: realtimeBlock, hourly: hourlyBlock }));

    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current?.tempC).toBe(20);
    expect(result.hourly).toHaveLength(1);
    expect(result.daily).toEqual([]);
  });

  it('realtime 缺失时 current 置 null,契约本来就允许', async () => {
    const provider = buildProvider(ok({ hourly: hourlyBlock, daily: dailyBlock }));

    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current).toBeNull();
    expect(result.hourly).toHaveLength(1);
    expect(result.daily).toHaveLength(1);
  });

  it('子块里的数组缺失时也不崩,退化成空数组', async () => {
    const provider = buildProvider(
      ok({ realtime: realtimeBlock, hourly: { skycon: [] }, daily: { skycon: [] } }),
    );

    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.hourly).toEqual([]);
    expect(result.daily).toEqual([]);
  });
});

describe('CaiyunProvider 契约字段', () => {
  it('realtime 缺字段时写 null 而不是 undefined,否则 JSON 序列化会把 key 整个丢掉', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({
        data: {
          status: 'ok',
          result: {
            // 只有必备的 temperature 和 skycon,其余字段一概缺失
            realtime: { temperature: 18, skycon: 'CLOUDY' },
          },
        },
      }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.getForecast({ lat: 39.92, lon: 116.41 });

    expect(result.current).toEqual({
      tempC: 18,
      feelsLikeC: null,
      conditionText: '阴',
      humidityPercent: null,
      windSpeedKph: null,
    });
    // 契约要求这些 key 必须存在且为 null。undefined 会被 JSON.stringify 丢掉,
    // 前端拿到的是"字段不存在"而不是 null,写 === null 的判断就会漏判
    const roundTripped = JSON.parse(JSON.stringify(result.current));
    expect('feelsLikeC' in roundTripped).toBe(true);
    expect(roundTripped.feelsLikeC).toBeNull();
  });
});

describe('CaiyunProvider 上游错误原因提取', () => {
  // 实测(2026-09-03):坏 token 时上游返回 HTTP 400 +
  // {"status":"failed","error":"token is invalid"},axios 直接抛,
  // 走不到响应体校验那道闸 —— 原因必须从 error.response.data 里捞
  const axiosErrorWith = (status: number, data: unknown, headers: Record<string, string> = {}) =>
    Object.assign(new Error(`Request failed with status code ${status}`), {
      response: { status, data, headers },
    });

  it('把 HTTP 4xx 响应体里的 error 提取到错误信息里,而不是只留 axios 那句状态码', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      throwError(() => axiosErrorWith(400, { status: 'failed', error: 'token is invalid' })),
    );

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/token is invalid/);
  });

  it('限流时把 Retry-After 一起记下来,便于判断要等多久', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      throwError(() => axiosErrorWith(429, 'Rate limit exceeded', { 'retry-after': '60' })),
    );

    const provider = buildProvider(getImpl);

    // 限流原因和等待秒数要同时出现在一条信息里
    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(
      /Rate limit exceeded.*60/,
    );
  });

  it('响应体里没有可读原因时,保留 axios 原始信息,不吞掉', async () => {
    const getImpl = vi.fn().mockReturnValue(throwError(() => new Error('network timeout')));

    const provider = buildProvider(getImpl);

    await expect(provider.getForecast({ lat: 39.92, lon: 116.41 })).rejects.toThrow(/network timeout/);
  });
});
