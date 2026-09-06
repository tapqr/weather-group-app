import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { CityInfo } from './weather.interface';

const FALLBACK_POPULAR_CITIES: CityInfo[] = [
  { name: '北京', province: '北京市', lat: 39.9042, lng: 116.4074 },
  { name: '上海', province: '上海市', lat: 31.2304, lng: 121.4737 },
  { name: '广州', province: '广东省', lat: 23.1291, lng: 113.2644 },
  { name: '深圳', province: '广东省', lat: 22.5431, lng: 114.0579 },
  { name: '杭州', province: '浙江省', lat: 30.2741, lng: 120.1551 },
  { name: '成都', province: '四川省', lat: 30.5728, lng: 104.0668 },
  { name: '武汉', province: '湖北省', lat: 30.5928, lng: 114.3055 },
  { name: '南京', province: '江苏省', lat: 32.0603, lng: 118.7969 },
  { name: '西安', province: '陕西省', lat: 34.3416, lng: 108.9398 },
  { name: '重庆', province: '重庆市', lat: 29.5630, lng: 106.5516 },
  { name: '苏州', province: '江苏省', lat: 31.2989, lng: 120.5853 },
  { name: '长沙', province: '湖南省', lat: 28.2282, lng: 112.9388 },
  { name: '青岛', province: '山东省', lat: 36.0671, lng: 120.3826 },
  { name: '厦门', province: '福建省', lat: 24.4798, lng: 118.0894 },
  { name: '昆明', province: '云南省', lat: 25.0406, lng: 102.7123 },
  { name: '天津', province: '天津市', lat: 39.0842, lng: 117.2008 },
];

@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);

  constructor(private readonly configService: ConfigService) {}

  private getBaseHost(): string {
    const rawHost = (this.configService.get<string>('QWEATHER_API_HOST') || '').trim();
    if (rawHost) {
      return rawHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }
    return 'devapi.qweather.com';
  }

  private getAuthHeaders(): Record<string, string> {
    const key = this.configService.get<string>('QWEATHER_API_KEY');
    if (key && key.trim()) {
      return { 'x-qw-api-key': key.trim() };
    }
    return {};
  }

  findDefaultCity(): CityInfo {
    return FALLBACK_POPULAR_CITIES[0];
  }

  /**
   * 获取热门城市列表 (优先使用和风 GeoAPI /geo/v2/city/top)
   */
  async getPopularCities(): Promise<CityInfo[]> {
    const host = this.getBaseHost();
    const headers = this.getAuthHeaders();

    if (headers['x-qw-api-key']) {
      try {
        const url = `https://${host}/geo/v2/city/top`;
        const res = await axios.get(url, {
          params: {
            number: 20,
            range: 'cn',
          },
          headers,
          timeout: 4000,
        });

        if (res.data?.code === '200' && Array.isArray(res.data?.topCityList)) {
          return res.data.topCityList.map((item: any) => ({
            name: item.name,
            province: item.adm1 || item.adm2,
            district: item.adm2 && item.adm2 !== item.name ? item.adm2 : undefined,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            id: item.id,
          }));
        }
      } catch (err: any) {
        this.logger.warn(`QWeather top cities fetch failed: ${err.message}, fallback to local list`);
      }
    }

    return FALLBACK_POPULAR_CITIES;
  }

  /**
   * 关键词检索城市 (使用和风 GeoAPI /geo/v2/city/lookup)
   */
  async searchCity(query: string): Promise<CityInfo[]> {
    const trimmed = (query || '').trim();
    if (!trimmed) {
      return this.getPopularCities();
    }

    const host = this.getBaseHost();
    const headers = this.getAuthHeaders();

    if (headers['x-qw-api-key']) {
      try {
        const url = `https://${host}/geo/v2/city/lookup`;
        const res = await axios.get(url, {
          params: {
            location: trimmed,
            number: 10,
          },
          headers,
          timeout: 4000,
        });

        if (res.data?.code === '200' && Array.isArray(res.data?.location)) {
          return res.data.location.map((item: any) => ({
            name: item.adm2 && item.adm2 !== item.name ? `${item.adm2} · ${item.name}` : item.name,
            province: item.adm1,
            district: item.adm2,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            id: item.id,
          }));
        }
      } catch (err: any) {
        this.logger.warn(`QWeather Geo search error: ${err.message}, fallback to local list`);
      }
    }

    // Local fallback
    const filtered = FALLBACK_POPULAR_CITIES.filter(
      (c) =>
        c.name.includes(trimmed) ||
        (c.province && c.province.includes(trimmed))
    );

    if (filtered.length > 0) {
      return filtered;
    }

    return [
      {
        name: trimmed,
        province: '自定义地点',
        lat: 39.9042,
        lng: 116.4074,
      },
    ];
  }

  /**
   * 通过经纬度反查城市信息 (和风 GeoAPI 逆地理编码)
   */
  async getCityByCoords(lat: number, lng: number): Promise<CityInfo | null> {
    const host = this.getBaseHost();
    const headers = this.getAuthHeaders();

    if (headers['x-qw-api-key']) {
      try {
        const url = `https://${host}/geo/v2/city/lookup`;
        const res = await axios.get(url, {
          params: {
            location: `${lng.toFixed(4)},${lat.toFixed(4)}`,
            number: 1,
          },
          headers,
          timeout: 4000,
        });

        if (res.data?.code === '200' && Array.isArray(res.data?.location) && res.data.location.length > 0) {
          const item = res.data.location[0];
          const displayName = item.adm2 && item.adm2 !== item.name
            ? `${item.adm2} · ${item.name}`
            : (item.name || item.adm2 || item.adm1);

          return {
            name: displayName,
            province: item.adm1,
            district: item.adm2,
            lat: parseFloat(item.lat),
            lng: parseFloat(item.lon),
            id: item.id,
          };
        }
      } catch (err: any) {
        this.logger.warn(`QWeather reverse geocoding error: ${err.message}`);
      }
    }

    return null;
  }
}
