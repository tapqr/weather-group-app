import { formatLocationName } from './location-display';
import type { NormalizedLocation } from '../types/location';

const loc = (over: Partial<NormalizedLocation>): NormalizedLocation => ({
  id: '1',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.9,
  lon: 116.4,
  ...over,
});

describe('formatLocationName', () => {
  it('地级市自身的 name 与 adm2 重复时只显示一个', () => {
    // 实测:搜索「厦门」返回 name="厦门" adm2="厦门",拼接会得到"厦门 厦门"
    expect(formatLocationName(loc({ name: '厦门', adm2: '厦门', adm1: '福建省' }))).toBe('厦门');
  });

  it('直辖市反查到区级时显示「市·区」', () => {
    expect(formatLocationName(loc({ name: '东城', adm2: '北京' }))).toBe('北京·东城');
    expect(formatLocationName(loc({ name: '海淀', adm2: '北京' }))).toBe('北京·海淀');
  });

  it('同名地点靠上级城市区分', () => {
    expect(formatLocationName(loc({ name: '朝阳', adm2: '朝阳', adm1: '辽宁省' }))).toBe('朝阳');
    expect(formatLocationName(loc({ name: '朝阳', adm2: '北京', adm1: '北京市' }))).toBe('北京·朝阳');
  });

  it('没有地名时回落到「当前位置」,而不是空字符串或 undefined', () => {
    expect(formatLocationName(null)).toBe('当前位置');
  });

  it('adm2 缺失时只显示 name,不会渲染出多余的分隔符', () => {
    expect(formatLocationName(loc({ name: '东城', adm2: '' }))).toBe('东城');
  });
});
