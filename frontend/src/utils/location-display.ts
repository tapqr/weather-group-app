import type { NormalizedLocation } from '../types/location';

/**
 * 把地点格式化成标题用的短名。
 *
 * 两个坑都来自实测:直辖市反查出来是区级("东城"而非"北京"),而地级市自身的
 * name 与 adm2 是重复的("厦门"/"厦门"),无脑拼接会得到"厦门 厦门"。
 *
 * 顶部标题和搜索结果列表共用这个函数,保证两处显示一致。
 */
export function formatLocationName(location: NormalizedLocation | null): string {
  if (!location) {
    return '当前位置';
  }
  if (!location.adm2 || location.adm2 === location.name) {
    return location.name;
  }
  return `${location.adm2}·${location.name}`;
}
