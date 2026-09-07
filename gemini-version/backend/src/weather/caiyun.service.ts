import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import {
  ProviderWeatherRealtime,
  HourlyComparisonItem,
  DailyComparisonItem,
  MinutelyRainData,
} from './weather.interface';

const SKYCON_MAP: Record<string, { text: string; icon: string }> = {
  CLEAR_DAY: { text: '晴', icon: 'Sun' },
  CLEAR_NIGHT: { text: '晴', icon: 'Moon' },
  PARTLY_CLOUDY_DAY: { text: '多云', icon: 'CloudSun' },
  PARTLY_CLOUDY_NIGHT: { text: '多云', icon: 'CloudMoon' },
  CLOUDY: { text: '阴', icon: 'Cloud' },
  LIGHT_HAZE: { text: '轻度雾霾', icon: 'Haze' },
  MODERATE_HAZE: { text: '中度雾霾', icon: 'Haze' },
  HEAVY_HAZE: { text: '重度雾霾', icon: 'Haze' },
  LIGHT_RAIN: { text: '小雨', icon: 'CloudDrizzle' },
  MODERATE_RAIN: { text: '中雨', icon: 'CloudRain' },
  HEAVY_RAIN: { text: '大雨', icon: 'CloudRain' },
  STORM_RAIN: { text: '暴雨', icon: 'CloudLightning' },
  FOG: { text: '雾', icon: 'CloudFog' },
  LIGHT_SNOW: { text: '小雪', icon: 'Snowflake' },
  MODERATE_SNOW: { text: '中雪', icon: 'Snowflake' },
  HEAVY_SNOW: { text: '大雪', icon: 'Snowflake' },
  STORM_SNOW: { text: '暴雪', icon: 'Snowflake' },
  DUST: { text: '浮尘', icon: 'Wind' },
  SAND: { text: '沙尘', icon: 'Wind' },
  WIND: { text: '大风', icon: 'Wind' },
};

@Injectable()
export class CaiyunService {
  private readonly logger = new Logger(CaiyunService.name);

  constructor(private readonly configService: ConfigService) {}

  isConfigured(): boolean {
    const token = this.configService.get<string>('CAIYUN_TOKEN');
    return !!token && token !== 'your_caiyun_token_here' && token.trim().length > 5;
  }

  async fetchWeather(lat: number, lng: number): Promise<{
    realtime: ProviderWeatherRealtime;
    hourly: any[];
    daily: any[];
    minutely: MinutelyRainData;
  }> {
    const token = this.configService.get<string>('CAIYUN_TOKEN');

    if (this.isConfigured()) {
      try {
        const url = `https://api.caiyunapp.com/v2.6/${token}/${lng},${lat}/weather?alert=true&dailysteps=7&hourlysteps=24`;
        const res = await axios.get(url, { timeout: 6000 });
        if (res.data?.status === 'ok' && res.data?.result) {
          return this.parseCaiyunData(res.data.result, false);
        }
      } catch (err: any) {
        this.logger.warn(`Caiyun API call failed: ${err.message}. Using high-fidelity mock data.`);
      }
    }

    // Fallback to high-fidelity mock
    return this.generateMockCaiyunData(lat, lng);
  }

  private parseCaiyunData(result: any, isMock: boolean) {
    const rt = result.realtime || {};
    const skyconInfo = SKYCON_MAP[rt.skycon] || { text: '晴', icon: 'Sun' };

    const realtime: ProviderWeatherRealtime = {
      source: 'caiyun',
      sourceName: '彩云天气',
      temp: Math.round(rt.temperature ?? 22),
      feelsLike: Math.round(rt.apparent_temperature ?? rt.temperature ?? 22),
      text: skyconInfo.text,
      icon: skyconInfo.icon,
      humidity: Math.round((rt.humidity ?? 0.5) * 100),
      windSpeed: Math.round(rt.wind?.speed ?? 12),
      windScale: `${Math.min(12, Math.round((rt.wind?.speed ?? 10) / 4))}级`,
      windDir: this.getWindDirection(rt.wind?.direction ?? 180),
      precip: parseFloat((rt.precipitation?.local?.intensity ?? 0).toFixed(2)),
      pressure: Math.round((rt.pressure ?? 101325) / 100),
      visibility: Math.round(rt.visibility ?? 10),
      aqi: {
        value: rt.air_quality?.aqi?.chn ?? 45,
        category: this.getAqiCategory(rt.air_quality?.aqi?.chn ?? 45),
        pm25: rt.air_quality?.pm25 ?? 25,
      },
      updateTime: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isMock,
      statusText: isMock ? '演示模拟数据 (配置Key体验实时数据)' : '彩云官方实时源',
    };

    const hourly = (result.hourly?.temperature || []).slice(0, 24).map((item: any, idx: number) => {
      const sky = result.hourly?.skycon?.[idx]?.value || 'CLEAR_DAY';
      const precip = result.hourly?.precipitation?.[idx]?.value || 0;
      const skyInfo = SKYCON_MAP[sky] || { text: '多云', icon: 'CloudSun' };
      const dt = new Date(item.datetime);
      const hour = dt.getHours().toString().padStart(2, '0') + ':00';
      return {
        datetime: item.datetime,
        time: hour,
        temp: Math.round(item.value),
        text: skyInfo.text,
        icon: skyInfo.icon,
        precip: parseFloat(precip.toFixed(2)),
        pop: Math.min(100, Math.round(precip * 50)),
      };
    });

    const daily = (result.daily?.temperature || []).slice(0, 7).map((item: any, idx: number) => {
      const sky = result.daily?.skycon?.[idx]?.value || 'CLEAR_DAY';
      const skyInfo = SKYCON_MAP[sky] || { text: '晴', icon: 'Sun' };
      const pop = Math.round((result.daily?.precipitation?.[idx]?.probability ?? 0) * 100);
      const dt = new Date(item.date);
      return {
        date: item.date.slice(0, 10),
        weekday: this.getWeekday(dt, idx),
        maxTemp: Math.round(item.max),
        minTemp: Math.round(item.min),
        dayText: skyInfo.text,
        nightText: skyInfo.text,
        pop: pop,
      };
    });

    const minutely: MinutelyRainData = {
      summary: result.minutely?.description || '未来两小时无降水，适宜外出',
      radarRainList: (result.minutely?.precipitation_2h || []).filter((_: any, i: number) => i % 5 === 0).slice(0, 24),
      probabilities: (result.minutely?.probability || []).slice(0, 4).map((v: number) => Math.round(v * 100)),
    };

    return { realtime, hourly, daily, minutely };
  }

  private generateMockCaiyunData(lat: number, lng: number) {
    // Generate deterministic yet lively seasonal variation based on coordinates
    const baseTemp = Math.round(23 + Math.sin(lat) * 4);
    const now = new Date();

    const realtime: ProviderWeatherRealtime = {
      source: 'caiyun',
      sourceName: '彩云天气',
      temp: baseTemp,
      feelsLike: baseTemp + 1,
      text: '多云',
      icon: 'CloudSun',
      humidity: 58,
      windSpeed: 14,
      windScale: '3级',
      windDir: '东南风',
      precip: 0.0,
      pressure: 1012,
      visibility: 15,
      aqi: {
        value: 42,
        category: '优',
        pm25: 18,
      },
      updateTime: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
      isMock: true,
      statusText: '演示模拟模式 (在.env中配置CAIYUN_TOKEN即可切换实时)',
    };

    const hourly = [];
    for (let i = 0; i < 24; i++) {
      const h = (now.getHours() + i) % 24;
      const hourStr = `${h.toString().padStart(2, '0')}:00`;
      const tempDelta = Math.round(Math.sin(((h - 6) / 24) * Math.PI * 2) * 5);
      const isRainHour = i >= 4 && i <= 6; // Simulated slight rain window in afternoon
      hourly.push({
        datetime: new Date(now.getTime() + i * 3600000).toISOString(),
        time: hourStr,
        temp: baseTemp + tempDelta,
        text: isRainHour ? '零星小雨' : (h > 18 || h < 6 ? '晴间多云' : '多云'),
        icon: isRainHour ? 'CloudDrizzle' : (h > 18 || h < 6 ? 'Moon' : 'CloudSun'),
        precip: isRainHour ? 0.3 : 0.0,
        pop: isRainHour ? 45 : 10,
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
        maxTemp: baseTemp + 4 + (i % 3),
        minTemp: baseTemp - 5 - (i % 2),
        dayText: isRainyDay ? '小雨' : i % 2 === 0 ? '多云' : '晴',
        nightText: i % 2 === 0 ? '阴' : '晴',
        pop: isRainyDay ? 70 : 15,
      });
    }

    const minutely: MinutelyRainData = {
      summary: '未来两小时无雨，半小时后局部有薄云覆盖',
      radarRainList: [0, 0, 0, 0, 0.05, 0.12, 0.08, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      probabilities: [15, 20, 10, 5],
    };

    return { realtime, hourly, daily, minutely };
  }

  private getWindDirection(deg: number): string {
    const directions = ['北风', '东北风', '东风', '东南风', '南风', '西南风', '西风', '西北风'];
    const index = Math.round(((deg %= 360) < 0 ? deg + 360 : deg) / 45) % 8;
    return directions[index];
  }

  private getAqiCategory(aqi: number): string {
    if (aqi <= 50) return '优';
    if (aqi <= 100) return '良';
    if (aqi <= 150) return '轻度污染';
    if (aqi <= 200) return '中度污染';
    if (aqi <= 300) return '重度污染';
    return '严重污染';
  }

  private getWeekday(date: Date, index: number): string {
    if (index === 0) return '今天';
    if (index === 1) return '明天';
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return weekdays[date.getDay()];
  }
}
