import { mount } from '@vue/test-utils';
import WeatherIcon from './WeatherIcon.vue';
import type { ConditionCategory } from '../utils/weather-display';

describe('WeatherIcon', () => {
  it('renders a distinct glyph for every condition category', () => {
    // 七个分类必须各画各的 —— 两个分类共用同一段 path 会让"两家报的天气不同"
    // 这件事在图标上看不出来,而那正是这个产品要展示的东西
    const categories: ConditionCategory[] = ['clear', 'cloudy', 'rain', 'snow', 'haze', 'wind', 'unknown'];
    const shapes = categories.map((condition) =>
      mount(WeatherIcon, { props: { condition } }).find('svg').html(),
    );

    expect(new Set(shapes).size).toBe(categories.length);
  });

  it('draws the sun by day and the moon by night for a clear sky', () => {
    // 彩云的 CLEAR_DAY / CLEAR_NIGHT 在后端归一化时都被压成了「晴」,
    // 昼夜信息那一步就丢了 —— 所以图标只能靠本地时钟判断
    const day = mount(WeatherIcon, { props: { condition: 'clear', daypart: 'day' } });
    const night = mount(WeatherIcon, { props: { condition: 'clear', daypart: 'night' } });

    // 白天版有太阳的圆心和射线
    expect(day.find('circle').exists()).toBe(true);
    expect(day.findAll('path')).toHaveLength(1);
    // 夜间版是一条月牙路径,没有圆
    expect(night.find('circle').exists()).toBe(false);
    expect(night.findAll('path')).toHaveLength(1);
    expect(day.html()).not.toBe(night.html());
  });

  it('ignores daypart for conditions where it has no meaning', () => {
    // 只有晴天分日月;下雨的图标不该因为昼夜而变
    const dayRain = mount(WeatherIcon, { props: { condition: 'rain', daypart: 'day' } });
    const nightRain = mount(WeatherIcon, { props: { condition: 'rain', daypart: 'night' } });

    expect(dayRain.html()).toBe(nightRain.html());
  });

  it('defaults to the daytime glyph when no daypart is given', () => {
    const implicit = mount(WeatherIcon, { props: { condition: 'clear' } });
    const explicit = mount(WeatherIcon, { props: { condition: 'clear', daypart: 'day' } });

    expect(implicit.html()).toBe(explicit.html());
  });

  it('honours the size prop on both dimensions', () => {
    const wrapper = mount(WeatherIcon, { props: { condition: 'cloudy', size: 18 } });

    expect(wrapper.find('svg').attributes('width')).toBe('18');
    expect(wrapper.find('svg').attributes('height')).toBe('18');
  });

  it('is hidden from assistive tech, since the condition is always spelled out in text next to it', () => {
    const wrapper = mount(WeatherIcon, { props: { condition: 'rain' } });

    expect(wrapper.find('svg').attributes('aria-hidden')).toBe('true');
  });
});
