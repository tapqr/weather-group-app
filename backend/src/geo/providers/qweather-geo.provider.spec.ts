import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import type { Mock } from 'vitest';
import { QWeatherGeoProvider } from './qweather-geo.provider.js';

function buildProvider(getImpl: Mock) {
  const httpService = { get: getImpl } as any;
  const configService = {
    get: (key: string) => (key === 'qweather.apiHost' ? 'test.qweatherapi.com' : 'test-key'),
  } as any;
  return new QWeatherGeoProvider(httpService, configService);
}

// 和风 GeoAPI 实测返回的字段形状(2026-09-03,坐标 116.4074,39.9042)
const beijingDongcheng = {
  name: '东城',
  id: '101011600',
  lat: '39.91755',
  lon: '116.41876',
  adm2: '北京',
  adm1: '北京市',
  country: '中国',
  tz: 'Asia/Shanghai',
  type: 'city',
  rank: '35',
};

describe('QWeatherGeoProvider.reverse', () => {
  it('把坐标反查结果归一化,并把字符串经纬度转成 number', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '200', location: [beijingDongcheng] } }));

    const provider = buildProvider(getImpl);
    const result = await provider.reverse(39.9042, 116.4074);

    expect(result).toEqual({
      id: '101011600',
      name: '东城',
      adm1: '北京市',
      adm2: '北京',
      lat: 39.91755,
      lon: 116.41876,
    });
    // 请求要打专属 API Host,经度在前纬度在后
    const [url, config] = getImpl.mock.calls[0];
    expect(url).toBe('https://test.qweatherapi.com/geo/v2/city/lookup');
    expect(config.params.location).toBe('116.4074,39.9042');
    expect(config.headers['X-QW-Api-Key']).toBe('test-key');
  });

  it('上游 code 404(无匹配结果)返回 null,而不是抛错', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '404' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.reverse(0, 0)).resolves.toBeNull();
  });

  it('上游 code 非 200 也非 404 时抛错,把 code 带进错误信息', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '403' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.reverse(39.9, 116.4)).rejects.toThrow(/403/);
  });

  it('实测:上游 HTTP 400 + error.type 含 no-such-location 时返回 null,而不是抛错', async () => {
    // 和风新版 Error Code v2 对"查无此地"的真实响应(2026-09-03 实测):
    // HTTP 400,body 形如 { error: { status: 400, type: ".../no-such-location", title, detail } }
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          error: {
            status: 400,
            type: 'https://dev.qweather.com/docs/resource/error-code/#no-such-location',
            title: 'No Such Location',
            detail: 'Cannot find the location of the query, please try another location.',
          },
        },
      },
    });
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => axiosError));

    const provider = buildProvider(getImpl);

    await expect(provider.reverse(0, 0)).resolves.toBeNull();
  });
});

describe('QWeatherGeoProvider 200 但字段缺失的空结果', () => {
  it('code=200 且 location 字段缺失时仍返回空数组,但要打一条 warn 日志(区别于"查无此地")', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '200' } }));

    const provider = buildProvider(getImpl);
    const result = await provider.reverse(39.9042, 116.4074);

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();

    warnSpy.mockRestore();
  });

  it('"查无此地"(HTTP 400 + no-such-location)不打 warn 日志 —— 那是正常业务结果', async () => {
    const warnSpy = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          error: {
            status: 400,
            type: 'https://dev.qweather.com/docs/resource/error-code/#no-such-location',
            title: 'No Such Location',
            detail: 'Cannot find the location of the query, please try another location.',
          },
        },
      },
    });
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => axiosError));

    const provider = buildProvider(getImpl);
    await provider.reverse(0, 0);

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

describe('QWeatherGeoProvider.search', () => {
  it('返回归一化后的多个候选,保留上游顺序', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({
        data: {
          code: '200',
          location: [
            { ...beijingDongcheng, name: '朝阳', id: '101071201', adm2: '朝阳', adm1: '辽宁省' },
            { ...beijingDongcheng, name: '朝阳', id: '101010300', adm2: '北京', adm1: '北京市' },
          ],
        },
      }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.search('朝阳');

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ name: '朝阳', adm1: '辽宁省' });
    expect(result[1]).toMatchObject({ name: '朝阳', adm1: '北京市' });
    const [url, config] = getImpl.mock.calls[0];
    expect(url).toBe('https://test.qweatherapi.com/geo/v2/city/lookup');
    expect(config.params).toMatchObject({ location: '朝阳', number: 10 });
  });

  it('无匹配结果时返回空数组', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(of({ data: { code: '404' } }));

    const provider = buildProvider(getImpl);

    await expect(provider.search('不存在的地方')).resolves.toEqual([]);
  });

  it('实测:上游 HTTP 400 + error.type 含 no-such-location 时返回空数组,而不是抛错', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      response: {
        status: 400,
        data: {
          error: {
            status: 400,
            type: 'https://dev.qweather.com/docs/resource/error-code/#no-such-location',
            title: 'No Such Location',
            detail: 'Cannot find the location of the query, please try another location.',
          },
        },
      },
    });
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => axiosError));

    const provider = buildProvider(getImpl);

    await expect(provider.search('不存在的地方')).resolves.toEqual([]);
  });
});

describe('QWeatherGeoProvider.top', () => {
  it('读的是 topCityList 字段,不是 location', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(
      of({ data: { code: '200', topCityList: [{ ...beijingDongcheng, name: '北京', id: '101010100' }] } }),
    );

    const provider = buildProvider(getImpl);
    const result = await provider.top();

    expect(result).toEqual([
      { id: '101010100', name: '北京', adm1: '北京市', adm2: '北京', lat: 39.91755, lon: 116.41876 },
    ]);
    const [url, config] = getImpl.mock.calls[0];
    expect(url).toBe('https://test.qweatherapi.com/geo/v2/city/top');
    expect(config.params).toMatchObject({ range: 'cn', number: 20 });
  });
});

describe('QWeatherGeoProvider 上游错误原因提取', () => {
  it('把 HTTP 错误响应体里的可读原因带进错误信息', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 401'), {
      response: { status: 401, data: { error: { title: 'Unauthorized', detail: 'API key is invalid' } } },
    });
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => axiosError));

    const provider = buildProvider(getImpl);

    await expect(provider.search('北京')).rejects.toThrow(/API key is invalid/);
  });

  it('没有可读原因时保留 axios 原始信息,不吞掉', async () => {
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => new Error('network timeout')));

    const provider = buildProvider(getImpl);

    await expect(provider.search('北京')).rejects.toThrow(/network timeout/);
  });

  it('HTTP 400 但 error.type 不是 no-such-location 时(例如 Key 无效)仍然抛错,不当成空结果', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 401'), {
      response: {
        status: 401,
        data: { error: { title: 'Unauthorized', detail: 'API key is invalid' } },
      },
    });
    const getImpl = vi.fn().mockReturnValueOnce(throwError(() => axiosError));

    const provider = buildProvider(getImpl);

    await expect(provider.search('北京')).rejects.toThrow(/API key is invalid/);
  });
});
