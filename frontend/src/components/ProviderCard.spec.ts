import { mount } from '@vue/test-utils';
import ProviderCard from './ProviderCard.vue';
import type { ProviderSlot } from '../stores/weather';

describe('ProviderCard', () => {
  it('renders the metrics row and daily forecast when the provider succeeds', () => {
    const slot: ProviderSlot = {
      provider: 'qweather',
      status: 'ok',
      errorMessage: null,
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
        daily: [
          { date: '2026-09-02', tempMinC: 15, tempMaxC: 25, conditionText: '晴', nightConditionText: null, precipitationProbabilityPercent: null },
        ],
      },
    };

    const wrapper = mount(ProviderCard, { props: { slot } });

    expect(wrapper.text()).toContain('和风天气');
    // 实况大温度由顶部对比区负责,卡片只渲染次级指标
    expect(wrapper.text()).toContain('40%');
    // 单位由 <small> 承载、间距用 CSS 控制,所以文本里数值和单位是相邻的
    expect(wrapper.text()).toContain('10km/h');
    expect(wrapper.text()).toContain('19°');
    // 逐日首行是"今天",温度统一取整
    expect(wrapper.text()).toContain('今天');
    expect(wrapper.text()).toContain('15°');
    expect(wrapper.text()).toContain('25°');
  });

  it('renders the hourly forecast list when hourly entries are present', () => {
    const slot: ProviderSlot = {
      provider: 'qweather',
      status: 'ok',
      errorMessage: null,
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
        hourly: [
          { time: '2026-09-02T15:00+08:00', tempC: 22, conditionText: '多云', precipitationProbabilityPercent: 20 },
        ],
        daily: [],
      },
    };

    const wrapper = mount(ProviderCard, { props: { slot } });

    expect(wrapper.text()).toContain('15时');
    expect(wrapper.text()).toContain('22°');
    expect(wrapper.text()).toContain('多云');
  });

  it('renders a fallback message when the provider failed', () => {
    const slot: ProviderSlot = {
      provider: 'caiyun',
      status: 'error',
      // 后端返回的就是这个固定文案(见 Global Constraints 里的"后端契约的最终形态")
      errorMessage: '数据源暂时不可用',
      data: null,
    };

    const wrapper = mount(ProviderCard, { props: { slot } });

    expect(wrapper.text()).toContain('数据源暂时不可用');
    expect(wrapper.text()).toContain('请稍后重试');
    // 后端的 message 本身就是给用户看的文案,不要重复包一层同义句
    expect(wrapper.text()).not.toContain('该数据源暂时不可用,请稍后重试(数据源暂时不可用)');
  });
});

describe('ProviderCard 新增指标', () => {
  function slotWith(
    current: Partial<import('../types/weather').NormalizedCurrentWeather> = {},
    daily: import('../types/weather').NormalizedDailyEntry[] = [],
  ): ProviderSlot {
    return {
      provider: 'caiyun',
      status: 'ok',
      errorMessage: null,
      data: {
        provider: 'caiyun',
        updatedAt: '2026-09-07T15:00:00+08:00',
        current: {
          tempC: 28.9,
          feelsLikeC: 30.1,
          conditionText: '晴',
          humidityPercent: 53,
          windSpeedKph: 7.76,
          windDirectionDeg: 36.13,
          windScale: 2,
          pressureHpa: 1004.9758,
          visibilityKm: 20.15,
          precipMm: 0,
          airQuality: { aqi: 45,
          category: '优',
          pm25: 17 },
          ...current,
        },
        hourly: [],
        daily,
      },
    };
  }

  it('renders every current metric, rounding the values that carry meaningless precision', () => {
    // 这组值取自 2026-09-07 北京实测。气压 1004.9758 是"帕 ÷ 100"的产物,
    // 能见度 20.15 同理 —— 小数位是单位换算的副产品,不是精度,所以取整显示
    const wrapper = mount(ProviderCard, { props: { slot: slotWith() } });
    const text = wrapper.text();

    expect(text).toContain('53%');
    // 风速统一取整(7.76 → 8):小数不代表更准,只是数据源的输出格式差异
    expect(text).toContain('8km/h');
    // 风向由角度算成中文方位(36.13° → 东北风),两家口径才一致
    expect(text).toContain('东北风');
    expect(text).toContain('2');
    expect(text).toContain('1005');
    expect(text).toContain('20');
    expect(text).toContain('45');
    expect(text).toContain('优');
    expect(text).toContain('17');
  });

  it('keeps the precipitation decimal instead of rounding a drizzle down to zero', () => {
    // 0.4mm 取整会变成 0,把"有点小雨"和"没下雨"抹成同一个显示
    const wrapper = mount(ProviderCard, { props: { slot: slotWith({ precipMm: 0.4 }) } });

    expect(wrapper.text()).toContain('0.4');
  });

  it('shows an em dash for metrics the provider could not supply', () => {
    // 字段级缺失:status 仍是 ok,只是某些指标没有 —— 该显示"—"而不是 0 或空白
    const wrapper = mount(ProviderCard, {
      props: {
        slot: slotWith({
          pressureHpa: null,
          visibilityKm: null,
          windDirectionDeg: null,
          windScale: null,
          airQuality: null,
        }),
      },
    });
    const text = wrapper.text();

    expect(text).toContain('—');
    // 有值的指标不受影响
    expect(text).toContain('53%');
  });

  it('shows wind force 0 as a real reading rather than as missing data', () => {
    // 0 级是"无风"这个观测结果,和"没拿到风速"含义完全不同
    const wrapper = mount(ProviderCard, {
      props: { slot: slotWith({ windScale: 0, windSpeedKph: 0.5 }) },
    });

    expect(wrapper.text()).toContain('东北风 0');
  });

  it('renders both the day and night condition when they differ', () => {
    const wrapper = mount(ProviderCard, {
      props: {
        slot: slotWith({}, [
          {
            date: '2026-09-07',
            tempMinC: 20,
            tempMaxC: 28,
            conditionText: '多云',
            nightConditionText: '小雨',
            precipitationProbabilityPercent: 0,
          },
        ]),
      },
    });

    expect(wrapper.text()).toContain('多云');
    expect(wrapper.find('.day-night').text()).toBe('/小雨');
  });

  it('shows only the daytime condition when the night one is unavailable', () => {
    // 拿不到夜间段时不能拿白天的值冒充 —— 那会造出"昼夜相同"的假象
    const wrapper = mount(ProviderCard, {
      props: {
        slot: slotWith({}, [
          {
            date: '2026-09-07',
            tempMinC: 20,
            tempMaxC: 28,
            conditionText: '多云',
            nightConditionText: null,
            precipitationProbabilityPercent: 0,
          },
        ]),
      },
    });

    expect(wrapper.text()).toContain('多云');
    // 用元素判断而不是搜 '/' —— 页面上 μg/m³、km/h、日期 09/07 都含斜杠
    expect(wrapper.find('.day-night').exists()).toBe(false);
  });
});
