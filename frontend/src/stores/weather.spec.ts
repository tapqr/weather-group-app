import { createPinia, setActivePinia } from 'pinia';
import { useWeatherStore } from './weather';
import * as weatherApi from '../api/weather';

describe('useWeatherStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('populates providers from a successful aggregated response', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-02T00:00:00+08:00',
            current: {
              tempC: 20,
              feelsLikeC: 20,
              conditionText: '晴',
              humidityPercent: 50,
              windSpeedKph: 10,
              // 本用例不关心这些指标,给 null(契约允许,表示该数据源没拿到)
              windDirectionDeg: null,
              windScale: null,
              pressureHpa: null,
              visibilityKm: null,
              precipMm: null,
              airQuality: null,
            },
            hourly: [],
            daily: [],
          },
        },
        { provider: 'caiyun', status: 'error', message: 'timeout' },
      ],
    });

    const store = useWeatherStore();
    await store.loadWeather(39.92, 116.41, '北京');

    expect(store.status).toBe('loaded');
    expect(store.cityName).toBe('北京');
    expect(store.providers).toEqual([
      {
        provider: 'qweather',
        status: 'ok',
        errorMessage: null,
        data: expect.objectContaining({ provider: 'qweather' }),
      },
      { provider: 'caiyun', status: 'error', data: null, errorMessage: 'timeout' },
    ]);
  });

  it('sets status to error when the request itself fails', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockRejectedValue(new Error('network down'));

    const store = useWeatherStore();
    await store.loadWeather(39.92, 116.41, '北京');

    expect(store.status).toBe('error');
    expect(store.errorMessage).toBe('network down');
  });
});
