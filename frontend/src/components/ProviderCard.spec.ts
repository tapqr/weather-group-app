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
        current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
        hourly: [],
        daily: [
          { date: '2026-09-02', tempMinC: 15, tempMaxC: 25, conditionText: '晴', precipitationProbabilityPercent: null },
        ],
      },
    };

    const wrapper = mount(ProviderCard, { props: { slot } });

    expect(wrapper.text()).toContain('和风天气');
    // 实况大温度由顶部对比区负责,卡片只渲染次级指标
    expect(wrapper.text()).toContain('40%');
    expect(wrapper.text()).toContain('10 km/h');
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
        current: { tempC: 20, feelsLikeC: 19, conditionText: '晴', humidityPercent: 40, windSpeedKph: 10 },
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
