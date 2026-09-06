import axios from 'axios';
import { WeatherComparisonResponse, CityInfo, ConfigStatusResponse } from '../types/weather';

const client = axios.create({
  baseURL: '/api/weather',
  timeout: 10000,
});

export const weatherApi = {
  async getComparison(city?: string, lat?: number, lng?: number): Promise<WeatherComparisonResponse> {
    const params: Record<string, any> = {};
    if (city) params.city = city;
    if (lat !== undefined && lng !== undefined) {
      params.lat = lat;
      params.lng = lng;
    }
    const res = await client.get<WeatherComparisonResponse>('/compare', { params });
    return res.data;
  },

  async getCities(query?: string): Promise<CityInfo[]> {
    const params: Record<string, any> = {};
    if (query) params.q = query;
    const res = await client.get<CityInfo[]>('/cities', { params });
    return res.data;
  },

  async getStatus(): Promise<ConfigStatusResponse> {
    const res = await client.get<ConfigStatusResponse>('/status');
    return res.data;
  },
};
