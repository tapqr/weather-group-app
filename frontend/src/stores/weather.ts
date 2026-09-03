import { defineStore } from 'pinia';
import { fetchWeather } from '../api/weather';
import type { NormalizedWeather, ProviderName } from '../types/weather';

export interface ProviderSlot {
  provider: ProviderName;
  status: 'ok' | 'error';
  data: NormalizedWeather | null;
  errorMessage: string | null;
}

interface WeatherStoreState {
  cityName: string | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  errorMessage: string | null;
  providers: ProviderSlot[];
}

export const useWeatherStore = defineStore('weather', {
  state: (): WeatherStoreState => ({
    cityName: null,
    status: 'idle',
    errorMessage: null,
    providers: [],
  }),
  actions: {
    async loadWeather(lat: number, lon: number, cityName: string) {
      this.cityName = cityName;
      this.status = 'loading';
      this.errorMessage = null;
      try {
        const aggregated = await fetchWeather(lat, lon);
        this.providers = aggregated.results.map((result) =>
          result.status === 'ok'
            ? { provider: result.provider, status: 'ok' as const, data: result.data, errorMessage: null }
            : { provider: result.provider, status: 'error' as const, data: null, errorMessage: result.message },
        );
        this.status = 'loaded';
      } catch (error) {
        this.status = 'error';
        this.errorMessage = error instanceof Error ? error.message : '未知错误';
      }
    },
    // 地名是异步反查出来的,到达时间晚于天气,所以要能单独更新标题
    setCityName(cityName: string) {
      this.cityName = cityName;
    },
  },
});
