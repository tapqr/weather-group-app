import { mount } from '@vue/test-utils';
import ConsensusCard from './ConsensusCard.vue';
import type { Consensus } from '../utils/consensus';

function consensus(overrides: Partial<Consensus> = {}): Consensus {
  return {
    level: 'high',
    headline: '各数据源高度一致',
    tempNote: '各数据源的实况温度完全一致',
    rainNote: '各数据源均判定当前无降水',
    notes: [],
    ...overrides,
  };
}

describe('ConsensusCard', () => {
  it('renders the headline and both facts', () => {
    const wrapper = mount(ConsensusCard, { props: { consensus: consensus() } });
    const text = wrapper.text();

    expect(text).toContain('各数据源高度一致');
    expect(text).toContain('各数据源的实况温度完全一致');
    expect(text).toContain('均判定当前无降水');
  });

  // 三档要能被扫一眼扫到,所以除了文字还带 data-level 供 CSS 换色
  it('exposes the level so the colour coding can key off it', () => {
    for (const level of ['high', 'moderate', 'divergent'] as const) {
      const wrapper = mount(ConsensusCard, { props: { consensus: consensus({ level }) } });
      expect(wrapper.find('.consensus').attributes('data-level')).toBe(level);
    }
  });

  it('renders the notes list when there is something to add', () => {
    const wrapper = mount(ConsensusCard, {
      props: {
        consensus: consensus({
          level: 'divergent',
          notes: ['未来 2 天的预报分歧显著', '16:00 前后降水概率抬头(彩云天气 68% / 和风天气 70%)'],
        }),
      },
    });

    const items = wrapper.findAll('.consensus__notes li');
    expect(items).toHaveLength(2);
    expect(items[1].text()).toContain('68%');
  });

  it('omits the notes list entirely when there are no notes', () => {
    // 空的 <ul> 会留下一条分隔线,看起来像内容加载失败
    const wrapper = mount(ConsensusCard, { props: { consensus: consensus({ notes: [] }) } });

    expect(wrapper.find('.consensus__notes').exists()).toBe(false);
  });
});
