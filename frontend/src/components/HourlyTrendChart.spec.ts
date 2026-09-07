import { mount } from '@vue/test-utils';
import HourlyTrendChart from './HourlyTrendChart.vue';
import type { AlignedHourly } from '../utils/align';

function hourly(
  axis: string[],
  series: Array<{ provider: string; label: string; temps: Array<number | null>; pops?: Array<number | null> }>,
): AlignedHourly {
  return {
    axis: axis.map((label) => ({ hourKey: `2026-09-07T${label.slice(0, 2)}`, label })),
    series: series.map((s) => ({
      provider: s.provider as AlignedHourly['series'][number]['provider'],
      label: s.label,
      temps: s.temps,
      pops: s.pops ?? s.temps.map(() => null),
    })),
  };
}

describe('HourlyTrendChart', () => {
  it('renders one line per provider', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, 27] },
          { provider: 'qweather', label: '和风天气', temps: [29, 28] },
        ]),
      },
    });

    const lines = wrapper.findAll('.trend__line');
    expect(lines).toHaveLength(2);
    expect(lines[0].attributes('data-provider')).toBe('caiyun');
    expect(lines[1].attributes('data-provider')).toBe('qweather');
  });

  // 断线本身的逐段断言在 utils/chart.spec.ts(buildLinePath)。这里只确认
  // 组件真的把带缺口的序列交给了它,而不是自己另搞一套
  it('renders a broken path for a series with a gap', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00', '17:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, null, 26] },
        ]),
      },
    });

    expect(wrapper.find('.trend__line').attributes('d')!.match(/M/g)).toHaveLength(2);
  });

  it('renders nothing when no provider has any temperature', () => {
    // 没有温度就没有刻度,画一个空坐标系只是噪音
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00'], [{ provider: 'caiyun', label: '彩云天气', temps: [null] }]),
      },
    });

    expect(wrapper.find('.trend').exists()).toBe(false);
  });

  it('still renders with a single provider', () => {
    // 一家挂掉时曲线不该整块消失 —— 剩下那家的趋势仍然有用
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, 27] },
        ]),
      },
    });

    expect(wrapper.findAll('.trend__line')).toHaveLength(1);
  });

  it('does not collapse the plot when every hour has the same temperature', () => {
    // 温度全相同时 span 为 0,除零会把所有点算成 NaN 坐标
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [25, 25] },
        ]),
      },
    });

    const d = wrapper.find('.trend__line').attributes('d')!;
    expect(d).not.toContain('NaN');
  });

  it('shows the first hour readings by default when every provider covers it', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, 27] },
          { provider: 'qweather', label: '和风天气', temps: [29, 28] },
        ]),
      },
    });

    const readout = wrapper.find('.trend__readout').text();
    expect(readout).toContain('15:00');
    expect(readout).toContain('彩云天气');
    expect(readout).toContain('28°');
    expect(readout).toContain('和风天气');
    expect(readout).toContain('29°');
  });

  /*
   * 默认时刻不能直接用第一格。实测两家的时间窗差一小时,第一格只有一家有数据 ——
   * 停在那里,读数条显示"和风 —°",会让人误以为和风整个没返回数据,
   * 而它其实只是没有那一个小时的预报。
   */
  it('skips leading hours that only some providers cover when picking the default', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00', '17:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, 27, 26] },
          { provider: 'qweather', label: '和风天气', temps: [null, 28, 27] },
        ]),
      },
    });

    const readout = wrapper.find('.trend__readout').text();
    // 落在 16:00 —— 两家齐全的第一个时刻,而不是 15:00
    expect(readout).toContain('16:00');
    expect(readout).not.toContain('—°');
    expect(readout).toContain('27°');
    expect(readout).toContain('28°');
  });

  it('falls back to the first hour when no hour has every provider', () => {
    // 两家时间窗完全不相交时没有"齐全"的时刻,退回第一格 —— 总得显示点什么
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '18:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, null] },
          { provider: 'qweather', label: '和风天气', temps: [null, 24] },
        ]),
      },
    });

    expect(wrapper.find('.trend__readout').text()).toContain('15:00');
  });

  it('shows an em dash in the readout for a provider missing that hour', () => {
    // 读数条要如实反映"这家在这个时刻没有数据",而不是留空或显示 0。
    // 时间窗完全不相交时默认退回第一格,那一格确实缺一家
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '18:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, null] },
          { provider: 'qweather', label: '和风天气', temps: [null, 24] },
        ]),
      },
    });

    const readout = wrapper.find('.trend__readout').text();
    expect(readout).toContain('28°');
    expect(readout).toContain('—°');
  });

  it('follows the new default hour when the city changes', async () => {
    // 索引在新数据里指向的是另一个时刻,所以切换城市要重置选择。
    // (指针交互本身在 jsdom 里测不了 —— clientX 只读、getBoundingClientRect 恒为 0,
    //  所以那部分逻辑抽成了 hourIndexFromRatio 并在 utils/chart.spec.ts 里直接测)
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, 27] },
        ]),
      },
    });
    expect(wrapper.find('.trend__readout').text()).toContain('15:00');

    await wrapper.setProps({
      hourly: hourly(['08:00', '09:00'], [
        { provider: 'caiyun', label: '彩云天气', temps: [null, 21] },
      ]),
    });

    // 新数据里 08:00 缺值,默认应落到 09:00
    expect(wrapper.find('.trend__readout').text()).toContain('09:00');
  });

  it('renders precipitation bars only where the probability is above zero', () => {
    // 概率为 0 的时刻不画柱子 —— 24 根高度为 0 的柱子只是 DOM 噪音
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00', '17:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28, 27, 26], pops: [0, 68, null] },
        ]),
      },
    });

    expect(wrapper.findAll('.trend__pop')).toHaveLength(1);
  });

  it('places each provider bar side by side rather than stacking them', () => {
    // 叠加会让人把两家的概率读成累计值
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [28], pops: [40] },
          { provider: 'qweather', label: '和风天气', temps: [29], pops: [60] },
        ]),
      },
    });

    const bars = wrapper.findAll('.trend__pop');
    expect(bars).toHaveLength(2);
    expect(bars[0].attributes('x')).not.toBe(bars[1].attributes('x'));
  });

  it('widens the canvas with the number of hours so 24 points stay scrollable', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(
          Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`),
          [{ provider: 'caiyun', label: '彩云天气', temps: Array.from({ length: 24 }, () => 25) }],
        ),
      },
    });

    // 每小时 32px,24 小时应远宽于手机屏 —— 外层容器负责横向滚动
    expect(Number(wrapper.find('.trend__svg').attributes('width'))).toBe(24 * 32);
  });
});

describe('HourlyTrendChart 的 y 轴', () => {
  it('labels three temperature ticks', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [20, 30] },
        ]),
      },
    });

    // 留白后范围是 19~31,中位 25
    expect(wrapper.findAll('.trend__ytick').map((t) => t.text())).toEqual(['31°', '25°', '19°']);
  });

  /*
   * 刻度必须画在**独立于滚动区**的 SVG 里。画在滚动区里的话横向滑动时
   * 数字会跟着滑出视野,那就白标了 —— 24 小时的画布宽 768px,手机屏只有 ~340px。
   */
  it('keeps the tick labels outside the horizontally scrolling area', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [20, 30] },
        ]),
      },
    });

    // 刻度在 .trend__yaxis 里,而 .trend__yaxis 不在 .trend__scroll 里
    expect(wrapper.find('.trend__yaxis .trend__ytick').exists()).toBe(true);
    expect(wrapper.find('.trend__scroll .trend__ytick').exists()).toBe(false);
  });

  it('draws one grid line per tick, aligned to the same y coordinates', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [20, 30] },
        ]),
      },
    });

    const gridY = wrapper.findAll('.trend__grid').map((l) => l.attributes('y1'));
    const tickY = wrapper.findAll('.trend__ytick').map((t) => t.attributes('y'));
    // 两个 SVG 共用同一个 yOf(),坐标必须逐个相等 —— 否则刻度和网格线会错开
    expect(gridY).toEqual(tickY);
    expect(gridY).toHaveLength(3);
  });

  it('spans the union of all providers so the vertical gap between lines means the temperature gap', () => {
    // 各家各算一套刻度的话,两条线的垂直距离就不再代表温差了
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [20] },
          { provider: 'qweather', label: '和风天气', temps: [30] },
        ]),
      },
    });

    expect(wrapper.findAll('.trend__ytick').map((t) => t.text())).toEqual(['31°', '25°', '19°']);
  });

  it('renders no axis at all when there is nothing to plot', () => {
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00'], [{ provider: 'caiyun', label: '彩云天气', temps: [null] }]),
      },
    });

    expect(wrapper.find('.trend__yaxis').exists()).toBe(false);
    expect(wrapper.findAll('.trend__grid')).toHaveLength(0);
  });

  it('keeps the plot usable when every hour has the same temperature', () => {
    // span 为 0 会让所有点算出 NaN 坐标。留白保证了 span 至少 2°
    const wrapper = mount(HourlyTrendChart, {
      props: {
        hourly: hourly(['15:00', '16:00'], [
          { provider: 'caiyun', label: '彩云天气', temps: [25, 25] },
        ]),
      },
    });

    expect(wrapper.find('.trend__line').attributes('d')).not.toContain('NaN');
    for (const line of wrapper.findAll('.trend__grid')) {
      expect(line.attributes('y1')).not.toContain('NaN');
    }
    expect(wrapper.findAll('.trend__ytick').map((t) => t.text())).toEqual(['26°', '25°', '24°']);
  });
});
