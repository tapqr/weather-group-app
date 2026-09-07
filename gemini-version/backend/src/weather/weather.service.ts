import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CaiyunService } from './caiyun.service';
import { QWeatherService } from './qweather.service';
import { GeoService } from './geo.service';
import {
  WeatherComparisonResponse,
  HourlyComparisonItem,
  DailyComparisonItem,
  WeatherComparisonAnalysis,
} from './weather.interface';

@Injectable()
export class WeatherService {
  private readonly logger = new Logger(WeatherService.name);

  constructor(
    private readonly caiyunService: CaiyunService,
    private readonly qweatherService: QWeatherService,
    private readonly geoService: GeoService,
    private readonly configService: ConfigService,
  ) {}

  getConfigStatus() {
    return {
      caiyun: {
        configured: this.caiyunService.isConfigured(),
        providerName: '彩云天气 (Caiyun Weather)',
        features: ['分钟级降水预报', '雷达降雨图', '小时级AQI', '公里级天气网格'],
      },
      qweather: {
        configured: this.qweatherService.isConfigured(),
        providerName: '和风天气 (QWeather)',
        features: ['官方气象数据源', '逐小时预报', '7天趋势', '空气质量多指标'],
      },
    };
  }

  async getComparison(cityName?: string, latStr?: string, lngStr?: string): Promise<WeatherComparisonResponse> {
    let lat: number;
    let lng: number;
    let displayCity = cityName || '北京';

    if (latStr && lngStr) {
      lat = parseFloat(latStr);
      lng = parseFloat(lngStr);
      const resolved = await this.geoService.getCityByCoords(lat, lng);
      if (resolved) {
        displayCity = resolved.name;
      } else if (cityName) {
        displayCity = cityName;
      } else {
        displayCity = '定位地点';
      }
    } else if (cityName) {
      const cities = await this.geoService.searchCity(cityName);
      if (cities.length > 0) {
        lat = cities[0].lat;
        lng = cities[0].lng;
        displayCity = cities[0].name;
      } else {
        const def = this.geoService.findDefaultCity();
        lat = def.lat;
        lng = def.lng;
        displayCity = def.name;
      }
    } else {
      const def = this.geoService.findDefaultCity();
      lat = def.lat;
      lng = def.lng;
      displayCity = def.name;
    }

    // Fetch both simultaneously
    const [caiyunData, qweatherData] = await Promise.all([
      this.caiyunService.fetchWeather(lat, lng),
      this.qweatherService.fetchWeather(lat, lng),
    ]);

    // Calculate Realtime Diff
    const tempDiff = caiyunData.realtime.temp - qweatherData.realtime.temp;
    const feelsLikeDiff = caiyunData.realtime.feelsLike - qweatherData.realtime.feelsLike;

    // Merge Hourly Forecast (24 hours)
    const hourly: HourlyComparisonItem[] = [];
    const minHours = Math.min(caiyunData.hourly.length, qweatherData.hourly.length, 24);

    for (let i = 0; i < minHours; i++) {
      const ch = caiyunData.hourly[i];
      const qh = qweatherData.hourly[i];
      const diff = ch.temp - qh.temp;
      const isRainCh = (ch.pop || 0) > 30 || (ch.precip || 0) > 0.1;
      const isRainQh = (qh.pop || 0) > 30 || (qh.precip || 0) > 0.1;
      const rainDivergent = isRainCh !== isRainQh;
      const tempDivergent = Math.abs(diff) >= 2;

      hourly.push({
        time: ch.time || qh.time,
        datetime: ch.datetime || qh.datetime,
        caiyun: ch,
        qweather: qh,
        tempDiff: diff,
        isDivergent: rainDivergent || tempDivergent,
      });
    }

    // Merge Daily Forecast (7 days)
    const daily: DailyComparisonItem[] = [];
    const minDays = Math.min(caiyunData.daily.length, qweatherData.daily.length, 7);

    for (let i = 0; i < minDays; i++) {
      const cd = caiyunData.daily[i];
      const qd = qweatherData.daily[i];
      const maxDiff = Math.abs(cd.maxTemp - qd.maxTemp);
      const minDiff = Math.abs(cd.minTemp - qd.minTemp);
      const totalDiff = maxDiff + minDiff;

      let agreement: 'high' | 'moderate' | 'low' = 'high';
      if (totalDiff > 4 || cd.dayText !== qd.dayText) {
        agreement = totalDiff > 6 ? 'low' : 'moderate';
      }

      daily.push({
        date: cd.date,
        weekday: cd.weekday,
        caiyun: cd,
        qweather: qd,
        tempRangeDiff: totalDiff,
        agreement,
      });
    }

    // Algorithmic Analysis
    const analysis = this.generateAnalysis(caiyunData, qweatherData, hourly, daily);

    return {
      location: {
        city: displayCity,
        lat,
        lng,
      },
      realtime: {
        caiyun: caiyunData.realtime,
        qweather: qweatherData.realtime,
        tempDiff,
        feelsLikeDiff,
      },
      hourly,
      daily,
      minutelyRain: {
        caiyun: caiyunData.minutely,
        qweatherSummary: qweatherData.realtime.text.includes('雨')
          ? '和风预报当前处于降雨范围'
          : '和风预报当前时段暂无降水',
      },
      analysis,
      meta: {
        caiyunConfigured: this.caiyunService.isConfigured(),
        qweatherConfigured: this.qweatherService.isConfigured(),
        serverTime: new Date().toISOString(),
      },
    };
  }

  private generateAnalysis(
    caiyun: any,
    qweather: any,
    hourly: HourlyComparisonItem[],
    daily: DailyComparisonItem[],
  ): WeatherComparisonAnalysis {
    const tempDiff = caiyun.realtime.temp - qweather.realtime.temp;
    const absTempDiff = Math.abs(tempDiff);

    // Weather condition comparison
    const caiyunText = caiyun.realtime.text;
    const qweatherText = qweather.realtime.text;
    const conditionMatch = caiyunText === qweatherText;

    // Rain comparison
    const caiyunHasRain = caiyun.realtime.precip > 0 || caiyunText.includes('雨');
    const qweatherHasRain = qweather.realtime.precip > 0 || qweatherText.includes('雨');

    let consensusStatus: 'high' | 'moderate' | 'divergent' = 'high';
    const highlights: string[] = [];

    // Check temp differences
    let tempDifferenceDesc = '';
    if (absTempDiff === 0) {
      tempDifferenceDesc = '两家预报实时温度完全一致';
    } else {
      const higher = tempDiff > 0 ? '彩云天气' : '和风天气';
      tempDifferenceDesc = `两源实时相差 ${absTempDiff}℃ (${higher}偏高)`;
    }

    // Rain check
    let rainDifferenceDesc = '';
    if (caiyunHasRain === qweatherHasRain) {
      rainDifferenceDesc = caiyunHasRain ? '双方均预报当前有降水' : '双方均预报当前无降水';
    } else {
      consensusStatus = 'divergent';
      const rainingSource = caiyunHasRain ? '彩云预报有雨' : '和风预报有雨';
      rainDifferenceDesc = `降水出现分歧：${rainingSource}，而另一方未预报降水`;
      highlights.push(`⚠️ 降雨预报分歧：${rainingSource}，外出建议携带雨具备用`);
    }

    // Daily agreement check
    const divergentDays = daily.filter((d) => d.agreement === 'low').length;
    if (divergentDays >= 2 && consensusStatus !== 'divergent') {
      consensusStatus = 'moderate';
    }

    // Hourly check for rain ahead
    const upcomingRainHourly = hourly.slice(0, 12).filter((h) => h.caiyun.pop > 40 || h.qweather.pop > 40);
    if (upcomingRainHourly.length > 0) {
      const firstRain = upcomingRainHourly[0];
      highlights.push(`🌧️ 预计约 ${firstRain.time} 左右降水概率增大 (${firstRain.caiyun.pop}% / ${firstRain.qweather.pop}%)`);
    } else {
      highlights.push(`☀️ 未来12小时内双方均预测降水概率较低，适宜出行`);
    }

    if (conditionMatch) {
      highlights.push(`✨ 实时天气状况双方一致：均为「${caiyunText}」`);
    } else {
      highlights.push(`🔍 状态细分：彩云判定为「${caiyunText}」，和风判定为「${qweatherText}」`);
    }

    let consensusText = '';
    if (consensusStatus === 'high') {
      consensusText = '双源数据高度一致，预报可信度极高';
    } else if (consensusStatus === 'moderate') {
      consensusText = '双源温度与趋势基本吻合，局部时段略有细微差异';
    } else {
      consensusText = '双源存在显著分歧，建议结合雷达与实时体感参考';
    }

    return {
      consensusStatus,
      consensusText,
      tempDifferenceDesc,
      rainDifferenceDesc,
      highlights,
    };
  }
}
