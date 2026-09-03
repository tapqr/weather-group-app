import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { NormalizedLocation } from '../interfaces/geo.interfaces.js';

interface QWeatherGeoRawLocation {
  id: string;
  name: string;
  adm1: string;
  adm2: string;
  lat: string;
  lon: string;
}

interface QWeatherGeoResponse {
  code: string;
  location?: QWeatherGeoRawLocation[];
  topCityList?: QWeatherGeoRawLocation[];
}

// 和风用 Error Code v2:失败时 body 形如 { error: { status, type, title, detail } }。
// axios 的 message 只有 "Request failed with status code 401",会丢掉 detail 里
// 那句真正有用的说明。与 qweather.provider.ts / caiyun.provider.ts 的做法保持一致。
export function describeGeoUpstreamError(error: unknown): string {
  const detail = extractErrorBody(error);
  if (detail?.title) {
    return detail.detail ? `${detail.title}: ${detail.detail}` : detail.title;
  }
  return error instanceof Error ? error.message : String(error);
}

// 实测确认(2026-09-03):和风新版 Error Code v2 对"查无此地"返回的是 HTTP 400 +
// body.error.type 形如 "https://dev.qweather.com/docs/resource/error-code/#no-such-location",
// 不是文档曾经暗示的 200 + code: "404"(那种形式从未在真实请求里出现过,axios 遇 4xx 直接抛)。
// 用 type 里的 "no-such-location" 片段识别,而不是用 HTTP 状态码 400 —— 400 也可能是参数错误、
// Key 无效等真实故障,把它们误判成"查无此地"会比现在的问题更糟(故障被悄悄吞掉且不告警)。
function isNoSuchLocationError(error: unknown): boolean {
  return extractErrorBody(error)?.type?.includes('no-such-location') ?? false;
}

function extractErrorBody(
  error: unknown,
): { status?: number; type?: string; title?: string; detail?: string } | undefined {
  return (
    error as { response?: { data?: { error?: { status?: number; type?: string; title?: string; detail?: string } } } }
  )?.response?.data?.error;
}

@Injectable()
export class QWeatherGeoProvider {
  private readonly logger = new Logger(QWeatherGeoProvider.name);
  private readonly apiHost: string;
  private readonly apiKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.apiHost = this.configService.get<string>('qweather.apiHost') ?? '';
    this.apiKey = this.configService.get<string>('qweather.apiKey') ?? '';
  }

  async reverse(lat: number, lon: number): Promise<NormalizedLocation | null> {
    // 和风的坐标参数是「经度,纬度」,与响应体里的顺序相反
    const list = await this.request('/geo/v2/city/lookup', { location: `${lon},${lat}` }, 'location');
    return list.length > 0 ? list[0] : null;
  }

  async search(q: string): Promise<NormalizedLocation[]> {
    return this.request('/geo/v2/city/lookup', { location: q, number: 10 }, 'location');
  }

  async top(): Promise<NormalizedLocation[]> {
    return this.request('/geo/v2/city/top', { range: 'cn', number: 20 }, 'topCityList');
  }

  private async request(
    path: string,
    params: Record<string, string | number>,
    field: 'location' | 'topCityList',
  ): Promise<NormalizedLocation[]> {
    let response;
    try {
      response = await firstValueFrom(
        this.httpService.get<QWeatherGeoResponse>(`https://${this.apiHost}${path}`, {
          params,
          headers: { 'X-QW-Api-Key': this.apiKey },
          timeout: 8000,
        }),
      );
    } catch (error) {
      // "查无此地"是 HTTP 400 + error.type 含 no-such-location,属于有效的空结果而不是
      // 故障 —— 上层会把它当成空结果缓存起来。其余错误(401/403/429/500 等)照旧抛出。
      if (isNoSuchLocationError(error)) {
        return [];
      }
      throw new Error(`和风地理接口请求失败: ${describeGeoUpstreamError(error)}`);
    }

    const body = response.data;
    // 404 是"查无此地",属于有效结果而不是故障 —— 上层会把它当成空结果缓存起来
    if (body?.code === '404') {
      return [];
    }
    if (body?.code !== '200') {
      throw new Error(`和风地理接口返回异常: code=${body?.code ?? 'unknown'}`);
    }

    const rawList = body[field];
    if (!rawList || rawList.length === 0) {
      // code === '200' 却没有(或空)结果字段,不同于"查无此地"(那种走上面两个
      // 提前 return 分支)—— 这大概率是上游响应形状异常。这类空目前会被当成有效
      // 结果缓存 24 小时,前端静默降级、日志毫无痕迹,所以在这里打一条 warn。
      this.logger.warn(`和风地理接口 code=200 但 ${field} 字段缺失或为空: path=${path}`);
      return [];
    }

    return rawList.map(
      (raw): NormalizedLocation => ({
        id: raw.id,
        name: raw.name,
        adm1: raw.adm1,
        adm2: raw.adm2,
        lat: Number(raw.lat),
        lon: Number(raw.lon),
      }),
    );
  }
}
