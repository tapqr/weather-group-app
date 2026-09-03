import type { NormalizedLocation } from '../types/location';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/**
 * 坐标反查地名。失败一律返回 null 而不抛错 —— 地名是锦上添花,不该打断天气流程。
 * 后端在上游失败时也返回 200 + location:null,这里再兜一层网络层失败。
 */
export async function fetchReverseLocation(lat: number, lon: number): Promise<NormalizedLocation | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/geo/reverse?lat=${lat}&lon=${lon}`);
    if (!response.ok) {
      return null;
    }
    const body: { location: NormalizedLocation | null } = await response.json();
    return body.location;
  } catch {
    return null;
  }
}

/** 关键词搜索。失败要抛错,让调用方能显示可重试的提示 —— 这是用户主动发起的操作。 */
export async function searchLocations(q: string): Promise<NormalizedLocation[]> {
  const response = await fetch(`${API_BASE_URL}/geo/search?q=${encodeURIComponent(q)}`);
  if (!response.ok) {
    throw new Error(`城市搜索失败: HTTP ${response.status}`);
  }
  const body: { locations: NormalizedLocation[] } = await response.json();
  return body.locations;
}

/** 热门城市,只用于搜索层空状态。失败返回空数组,调用方退回提示文案。 */
export async function fetchTopLocations(): Promise<NormalizedLocation[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/geo/top`);
    if (!response.ok) {
      return [];
    }
    const body: { locations: NormalizedLocation[] } = await response.json();
    return body.locations;
  } catch {
    return [];
  }
}
