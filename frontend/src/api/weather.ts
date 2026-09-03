import type { AggregatedWeatherResponse } from '../types/weather';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export async function fetchWeather(lat: number, lon: number): Promise<AggregatedWeatherResponse> {
  const response = await fetch(`${API_BASE_URL}/weather?lat=${lat}&lon=${lon}`);
  if (!response.ok) {
    throw new Error(`天气接口请求失败: HTTP ${response.status}`);
  }
  return response.json();
}
