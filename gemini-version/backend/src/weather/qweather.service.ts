import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ProviderWeatherRealtime,
  HourlyComparisonItem,
  DailyComparisonItem,
} from './weather.interface';

@Injectable()
export class QWeatherService {
  private readonly logger = new Logger(QWeatherService.name);

  constructor(private readonly configService: ConfigService) {}

  getBaseHost(): string {
    const rawHost = (this.configService.get<string>('QWEATHER_API_HOST') || '').trim();
    if (rawHost) {
      return rawHost.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    }
    return 'devapi.qweather.com';
  }

  isConfigured(): boolean {
    const key = this.configService.get<string>('QWEATHER_API_KEY');
    return !!key && key !== 'your_qweather_key_here' && key.trim().length > 5;
  }

  async fetchWeather(lat: number, lng: number): Promise<{
    realtime: ProviderWeatherRealtime;
    hourly: any[];
    daily: any[];
  }> {
    const key = this.configService.get<string>('QWEATHER_API_KEY');
    const host = this.getBaseHost();
    const latStr = lat.toFixed(4);
    const lngStr = lng.toFixed(4);

    if (this.isConfigured()) {
      try {
        const headers = { 'x-qw-api-key': key.trim() };
        // 和风天气 API v1 接口
        const [currentRes, hourlyRes, dailyRes] = await Promise.allSettled([
          axios.get(`https://${host}/weather/v1/current/${latStr}/${lngStr}`, { headers, timeout: 5000 }),
          axios.get(`https://${host}/weather/v1/hourly/${latStr}/${lngStr}`, { headers, timeout: 5000 }),
          axios.get(`https://${host}/weather/v1/daily/${latStr}/${lngStr}`, { headers, timeout: 5000 }),
        ]);

        const isCurrentOk = currentRes.status === 'fulfilled' && currentRes.value.status === 200;
        if (isCurrentOk) {
          const curData = (currentRes as PromiseFulfilledResult<any>).value.data;
          const hourlyData = hourlyRes.status === 'fulfilled' && hourlyRes.value.status === 200
            ? (hourlyRes as PromiseFulfilledResult<any>).value.data?.hours || []
            : [];
          const dailyData = dailyRes.status === 'fulfilled' && dailyRes.value.status === 200
            ? (dailyRes as PromiseFulfilledResult<any>).value.data?.days || []
            : [];

          return this.parseQWeatherV1Data(curData, hourlyData, dailyData, false);
        } else if (currentRes.status === 'rejected') {
          this.logger.warn(`QWeather v1 API rejected: ${currentRes.reason?.message}`);
        }
      } catch (err: any) {
        this.logger.warn(`QWeather v1 API call failed: ${err.message}. Using fallback mock data.`);
      }
    }

    return this.generateMockQWeatherData(lat, lng);
  }

  private parseQWeatherV1Data(current: any, hourlyList: any[], dailyList: any[], isMock: boolean) {
    const condText = current.condition?.text || '晴';
    const condCode = current.condition?.code || '100';
    const temp = Math.round(current.temperature?.value ?? 22);
    const feelsLike = Math.round(current.feelsLike?.value ?? temp);
    const humidity = Math.round((current.humidity ?? 0.5) * 100);
    const windSpeed = Math.round((current.wind?.speed?.value ?? 3) * 3.6);
    const windScale = `${current.wind?.scale ?? 1}级`;
    const windDir = this.getWindDirectionFromDegree(current.wind?.direction?.degree ?? 180);
    const precip = parseFloat((current.precipitation?.amount?.value ?? 0).toFixed(2));
    const pressure = Math.round(current.pressure?.value ?? 1013);
    const visibility = Math.round((current.visibility?.value ?? 15000) / 1000);

    const realtime: ProviderWeatherRealtime = {
      source: 'qweather',
      sourceName: '和风天气',
      temp,
      feelsLike,
      text: condText,
      icon: this.mapQWeatherIcon(condCode, condText),
      humidity,
      windSpeed,
      windScale,
      windDir,
      precip,
      pressure,
      visibility,
      aqi: {
        value: 46,
        category: '优',
        pm25: 22,
      },
      updateTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isMock,
      statusText: isMock ? '演示模拟数据 (配置Key体验实时数据)' : '和风官方实时源 (v1)',
    };

    const hourly = (hourlyList || []).slice(0, 24).map((item: any) => {
      const dt = new Date(item.forecastTime);
      const hour = dt.getHours().toString().padStart(2, '0') + ':00';
      return {
        datetime: item.forecastTime,
        time: hour,
        temp: Math.round(item.temperature?.value ?? temp),
        text: item.condition?.text ?? '多云',
        icon: this.mapQWeatherIcon(item.condition?.code, item.condition?.text),
        precip: parseFloat((item.precipitation?.amount?.value ?? 0).toFixed(2)),
        pop: Math.round(item.precipitation?.probability ?? 0),
      };
    });

    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const daily = (dailyList || []).slice(0, 7).map((item: any, idx: number) => {
      const dt = new Date(item.forecastStartTime);
      const localDate = new Date(dt.getTime() + 8 * 3600000);
      const dateStr = localDate.toISOString().slice(0, 10);
      const dayLabel = idx === 0 ? '今天' : idx === 1 ? '明天' : weekdays[localDate.getUTCDay()];
      const dayText = item.daytime?.condition?.text || item.nighttime?.condition?.text || '多云';
      const nightText = item.nighttime?.condition?.text || item.daytime?.condition?.text || '多云';

      return {
        date: dateStr,
        weekday: dayLabel,
        maxTemp: Math.round(item.temperatureMax?.value ?? temp + 3),
        minTemp: Math.round(item.temperatureMin?.value ?? temp - 4),
        dayText,
        nightText,
        pop: Math.round(item.daytime?.precipitation?.probability ?? 0),
      };
    });

    return { realtime, hourly, daily };
  }

  private generateMockQWeatherData(lat: number, lng: number) {
    const baseTemp = Math.round(23 + Math.sin(lat) * 4);
    const qTemp = baseTemp + 1;
    const now = new Date();

    const realtime: ProviderWeatherRealtime = {
      source: 'qweather',
      sourceName: '和风天气',
      temp: qTemp,
      feelsLike: qTemp,
      text: '阴',
      icon: 'Cloud',
      humidity: 63,
      windSpeed: 11,
      windScale: '2级',
      windDir: '东风',
      precip: 0.0,
      pressure: 1010,
      visibility: 12,
      aqi: {
        value: 46,
        category: '优',
        pm25: 22,
      },
      updateTime: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isMock: true,
      statusText: '演示模拟模式 (在.env中配置QWEATHER_API_KEY即可切换实时)',
    };

    const hourly = [];
    for (let i = 0; i < 24; i++) {
      const h = (now.getHours() + i) % 24;
      const hourStr = `${h.toString().padStart(2, '0')}:00`;
      const tempDelta = Math.round(Math.sin(((h - 5) / 24) * Math.PI * 2) * 4.5);
      const isRainHour = i >= 5 && i <= 7;
      hourly.push({
        datetime: new Date(now.getTime() + i * 3600000).toISOString(),
        time: hourStr,
        temp: qTemp + tempDelta,
        text: isRainHour ? '小雨' : (h > 18 || h < 6 ? '阴' : '多云转阴'),
        icon: isRainHour ? 'CloudRain' : 'Cloud',
        precip: isRainHour ? 0.4 : 0.0,
        pop: isRainHour ? 60 : 15,
      });
    }

    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const daily = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now.getTime() + i * 86400000);
      const dayLabel = i === 0 ? '今天' : i === 1 ? '明天' : weekdays[d.getDay()];
      const isRainyDay = i === 2;
      daily.push({
        date: d.toISOString().slice(0, 10),
        weekday: dayLabel,
        maxTemp: qTemp + 3 + (i % 2),
        minTemp: qTemp - 4 - (i % 3),
        dayText: isRainyDay ? '阵雨' : i % 2 === 0 ? '阴' : '多云',
        nightText: '阴',
        pop: isRainyDay ? 65 : 20,
      });
    }

    return { realtime, hourly, daily };
  }

  private getWindDirectionFromDegree(deg: number): string {
    const directions = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
    const index = Math.round(((deg %= 360) < 0 ? deg + 360 : deg) / 45) % 8;
    return directions[index];
  }

  private mapQWeatherIcon(iconCode: string, text: string): string {
    if (!text) return 'Sun';
    if (text.includes('雷')) return 'CloudLightning';
    if (text.includes('雨')) return text.includes('小') ? 'CloudDrizzle' : 'CloudRain';
    if (text.includes('雪')) return 'Snowflake';
    if (text.includes('雾') || text.includes('霾')) return 'CloudFog';
    if (text.includes('晴')) return 'Sun';
    if (text.includes('多云') || text.includes('少云')) return 'CloudSun';
    if (text.includes('阴')) return 'Cloud';
    if (text.includes('风')) return 'Wind';
    return 'CloudSun';
  }
}
