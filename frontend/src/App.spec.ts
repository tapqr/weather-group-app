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
          current: {
            tempC,
            feelsLikeC: tempC,
            conditionText: '晴',
            humidityPercent: 40,
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
            current: {
              tempC: 20,
              feelsLikeC: 19,
              conditionText: '晴',
              humidityPercent: 40,
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
            current: {
              tempC: 20,
              feelsLikeC: 19,
              conditionText: '晴',
              humidityPercent: 40,
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
            current: {
              tempC: 20,
              feelsLikeC: 19,
              conditionText: '晴',
              humidityPercent: 40,
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

describe('App 跨数据源区块', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('navigator', {
      geolocation: {
        getCurrentPosition: (success: PositionCallback) =>
          success({ coords: { latitude: 39.92, longitude: 116.41 } } as GeolocationPosition),
      },
    });
    vi.spyOn(geoApi, 'fetchReverseLocation').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function current(tempC: number, conditionText: string) {
    return {
      tempC,
      feelsLikeC: tempC,
      conditionText,
      humidityPercent: 50,
      windSpeedKph: 10,
      windDirectionDeg: 90,
      windScale: 2,
      pressureHpa: 1011,
      visibilityKm: 20,
      precipMm: 0,
      airQuality: { aqi: 45, category: '优', pm25: 17 },
    };
  }

  function twoProviders(): AggregatedWeatherResponse {
    return {
      results: [
        {
          provider: 'caiyun',
          status: 'ok',
          data: {
            provider: 'caiyun',
            updatedAt: '2026-09-07T15:00:00+08:00',
            // 起始时刻刻意比和风早一小时,复现实测到的错位场景
            current: current(28.9, '晴'),
            hourly: [
              { time: '2026-09-07T15:00+08:00', tempC: 28.9, conditionText: '晴', precipitationProbabilityPercent: 0 },
              { time: '2026-09-07T16:00+08:00', tempC: 27.9, conditionText: '晴', precipitationProbabilityPercent: 0 },
            ],
            daily: [
              { date: '2026-09-07', tempMinC: 20, tempMaxC: 28.9, conditionText: '多云', nightConditionText: '小雨', precipitationProbabilityPercent: 0 },
            ],
          },
        },
        {
          provider: 'qweather',
          status: 'ok',
          data: {
            provider: 'qweather',
            updatedAt: '2026-09-07T15:00:00+08:00',
            current: current(29, '阴'),
            hourly: [
              { time: '2026-09-07T16:00+08:00', tempC: 27.5, conditionText: '阴', precipitationProbabilityPercent: 68 },
              { time: '2026-09-07T17:00+08:00', tempC: 27, conditionText: '阴', precipitationProbabilityPercent: 70 },
            ],
            daily: [
              { date: '2026-09-07', tempMinC: 21.6, tempMaxC: 29, conditionText: '小雨', nightConditionText: '中雨', precipitationProbabilityPercent: 68 },
              { date: '2026-09-08', tempMinC: 18.3, tempMaxC: 21.5, conditionText: '小雨', nightConditionText: '晴间多云', precipitationProbabilityPercent: 88 },
            ],
          },
        },
      ],
    };
  }

  it('renders the trend chart once two providers report', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue(twoProviders());

    const wrapper = mount(App);
    await flushPromises();

    expect(wrapper.find('.trend').exists()).toBe(true);
    // 两家各一条曲线
    expect(wrapper.findAll('.trend__line')).toHaveLength(2);
  });

  /*
   * 页面刻意不对差异下任何聚合结论 —— 两家跑的是不同模型、不同更新节奏,
   * 分歧是系统性常态而非异常事件,把它渲染成告警等于天天亮红灯。
   * 详见 docs/adr/0002-no-consensus-verdict.md。
   */
  it('shows no verdict or warning banner about the divergence', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue(twoProviders());

    const wrapper = mount(App);
    await flushPromises();

    // 这组 fixture 里两家的天气文案和降水概率都明显不同,但页面不该出现任何结论文案
    const text = wrapper.text();
    for (const verdict of ['高度一致', '大体吻合', '存在明显分歧', '分歧']) {
      expect(text).not.toContain(verdict);
    }
  });

  it('keeps the chart and both cards when only one provider has data', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue({
      results: [
        twoProviders().results[0],
        { provider: 'qweather', status: 'error', message: '数据源暂时不可用' },
      ],
    });

    const wrapper = mount(App);
    await flushPromises();

    // 剩下那家的趋势仍然有用
    expect(wrapper.findAll('.trend__line')).toHaveLength(1);
    // 失败的数据源仍占一张卡片 —— "这里本该有一家的数据"本身就是信息
    expect(wrapper.text()).toContain('数据源暂时不可用');
    expect(wrapper.findAll('.provider-card')).toHaveLength(2);
  });

  it('leaves the daily rows unmarked, since a per-day grade is the same kind of verdict', async () => {
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue(twoProviders());

    const wrapper = mount(App);
    await flushPromises();

    for (const row of wrapper.findAll('.provider-card__daily li')) {
      expect(row.attributes('data-agreement')).toBeUndefined();
    }
  });

  it('aligns the two hourly series by timestamp in the rendered chart', async () => {
    // 彩云 15:00 起、和风 16:00 起 → 并集三个时刻。按下标配对只会有两个
    vi.spyOn(weatherApi, 'fetchWeather').mockResolvedValue(twoProviders());

    const wrapper = mount(App);
    await flushPromises();

    // x 轴刻度每 3 小时才显示一个,所以数 path 的断点更可靠:
    // 和风在 15:00 没有数据,它那条线必须从第二个点才起笔
    const lines = wrapper.findAll('.trend__line');
    const qweatherLine = lines.find((l) => l.attributes('data-provider') === 'qweather')!;
    const caiyunLine = lines.find((l) => l.attributes('data-provider') === 'caiyun')!;
    // 起笔的 x 坐标不同,说明两条线确实按各自的时刻落位而不是都从 0 开始
    const startX = (d: string) => Number(d.match(/^M([\d.]+)/)![1]);
    expect(startX(qweatherLine.attributes('d')!)).toBeGreaterThan(startX(caiyunLine.attributes('d')!));
  });
});
