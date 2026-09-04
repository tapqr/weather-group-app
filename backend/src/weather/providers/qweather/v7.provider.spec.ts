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
            now: { temp: '9', feelsLike: '7', text: '晴', humidity: '35', windSpeed: '12' },
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
            daily: [{ fxDate: '2026-09-02', tempMax: '15', tempMin: '5', textDay: '晴' }],
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
      humidityPercent: 35,
      windSpeedKph: 12,
    });
    expect(result.hourly).toEqual([
      { time: '2026-09-02T15:00+08:00', tempC: 10, conditionText: '多云', precipitationProbabilityPercent: 20 },
    ]);
    expect(result.daily).toEqual([
      { date: '2026-09-02', tempMinC: 5, tempMaxC: 15, conditionText: '晴', precipitationProbabilityPercent: null },
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
