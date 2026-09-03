import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import App from './App.vue';
import CitySearch from './components/CitySearch.vue';
import * as weatherApi from './api/weather';
import * as geoApi from './api/geo';
import type { NormalizedLocation } from './types/location';
import type { AggregatedWeatherResponse } from './types/weather';

const shanghai: NormalizedLocation = {
  id: '101020100',
  name: '上海',
  adm1: '上海市',
  adm2: '上海',
  lat: 31.2304,
  lon: 121.4737,
};

function weatherResultFor(tempC: number): AggregatedWeatherResponse {
  return {
    results: [
      {
        provider: 'qweather',
        status: 'ok',
        data: {
          provider: 'qweather',
          updatedAt: '2026-09-03T00:00:00+08:00',
          current: { tempC, feelsLikeC: tempC, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
          hourly: [],
          daily: [],
        },
      },
    ],
  };
}

describe('App', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads weather for the geolocated position on mount', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.92, longitude: 116.41 } } as GeolocationPosition),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-02T00:00:00+08:00',
            current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
            hourly: [],
            daily: [],
          },
        },
      ],
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(weatherApi.fetchWeather).toHaveBeenCalledWith(39.92, 116.41);
    expect(wrapper.text()).toContain('和风天气');
    expect(wrapper.text()).toContain('20°');
  });

  it('shows a manual-search hint when geolocation is denied', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ message: 'User denied Geolocation' } as GeolocationPositionError),
      },
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain('未获取到定位,请手动搜索城市查看天气');
    // 定位失败时搜索层要自动推到用户面前,不该让他自己找入口
    expect(wrapper.find('input[aria-label="搜索城市"]').exists()).toBe(true);
  });

  it('定位成功后用反查到的地名替换标题,且不阻塞天气渲染', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.9042, longitude: 116.4074 } } as GeolocationPosition),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-03T00:00:00+08:00',
            current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
            hourly: [],
            daily: [],
          },
        },
      ],
    });
    vi.spyOn(geoApi, 'fetchReverseLocation').mockResolvedValue({
      id: '101011600',
      name: '东城',
      adm1: '北京市',
      adm2: '北京',
      lat: 39.91755,
      lon: 116.41876,
    });

    const wrapper = mount(App);
    await flushPromises();

    expect(geoApi.fetchReverseLocation).toHaveBeenCalledWith(39.9042, 116.4074);
    expect(wrapper.text()).toContain('北京·东城');
    // 天气照常渲染
    expect(wrapper.text()).toContain('和风天气');
  });

  it('地名反查失败时标题回落到「当前位置」,天气不受影响', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.9042, longitude: 116.4074 } } as GeolocationPosition),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-03T00:00:00+08:00',
            current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
            hourly: [],
            daily: [],
          },
        },
      ],
    });
    vi.spyOn(geoApi, 'fetchReverseLocation').mockResolvedValue(null);

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain('当前位置');
    expect(wrapper.text()).toContain('和风天气');
  });

  it('手选城市后标题用反查名渲染,定位拒绝提示消失', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (_success: PositionCallback, error: PositionErrorCallback) =>
          error({ message: 'User denied Geolocation' } as GeolocationPositionError),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue(weatherResultFor(28));

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.text()).toContain('未获取到定位,请手动搜索城市查看天气');

    await wrapper.findComponent(CitySearch).vm.$emit('select', shanghai);
    await flushPromises();

    expect(weatherApi.fetchWeather).toHaveBeenCalledWith(shanghai.lat, shanghai.lon);
    expect(wrapper.text()).toContain('上海');
    expect(wrapper.text()).not.toContain('未获取到定位,请手动搜索城市查看天气');
  });

  it('迟到的定位反查结果不能覆盖用户手选的城市(选择世代仲裁)', async () => {
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.9042, longitude: 116.4074 } } as GeolocationPosition),
      },
    });
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue(weatherResultFor(20));

    let resolveReverse!: (location: NormalizedLocation | null) => void;
    vi.spyOn(geoApi, 'fetchReverseLocation').mockReturnValue(
      new Promise((resolve) => {
        resolveReverse = resolve;
      }),
    );

    const wrapper = mount(App);
    await flushPromises();

    // 反查还在途中,用户此时手选了上海
    await wrapper.findComponent(CitySearch).vm.$emit('select', shanghai);
    await flushPromises();

    expect(wrapper.text()).toContain('上海');

    // 反查终于回来了,带着"北京·东城" —— 但它属于已经过期的定位世代,不该生效
    resolveReverse({
      id: '101011600',
      name: '东城',
      adm1: '北京市',
      adm2: '北京',
      lat: 39.91755,
      lon: 116.41876,
    });
    await flushPromises();

    expect(wrapper.text()).toContain('上海');
    expect(wrapper.text()).not.toContain('北京·东城');
  });
});
