import { Controller, Get, Logger, Query, ValidationPipe } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { GeoService } from './geo.service.js';
import { GeoReverseQueryDto } from './dto/geo-reverse-query.dto.js';
import { GeoSearchQueryDto } from './dto/geo-search-query.dto.js';
import { NormalizedLocation } from './interfaces/geo.interfaces.js';

// 只受 geo 限流器约束。搜索比查天气频繁得多,共用一份额度会让用户搜几次城市后
// 刷新天气就撞 429 —— 而那个失败看起来像天气服务挂了
@SkipThrottle({ default: true })
@Controller('geo')
export class GeoController {
  private readonly logger = new Logger(GeoController.name);

  constructor(private readonly geoService: GeoService) {}

  // 三个路由的失败行为刻意不对称,见 spec"三个路由的失败行为刻意不对称"一节:
  // 用户没主动索取地名,不该为它弹错误 —— 失败静默返回 null,前端回落到"当前位置"
  @Get('reverse')
  async reverse(
    @Query(new ValidationPipe({ transform: true })) query: GeoReverseQueryDto,
  ): Promise<{ location: NormalizedLocation | null }> {
    try {
      return { location: await this.geoService.reverse(query.lat, query.lon) };
    } catch (error) {
      this.logger.warn(`地名反查失败: ${error instanceof Error ? error.message : String(error)}`);
      return { location: null };
    }
  }

  // 用户主动发起,必须有反馈 —— 失败向上抛,由 Nest 转成 500。
  // 详细原因只进服务端日志,不透传给浏览器
  @Get('search')
  async search(
    @Query(new ValidationPipe({ transform: true })) query: GeoSearchQueryDto,
  ): Promise<{ locations: NormalizedLocation[] }> {
    return { locations: await this.geoService.search(query.q) };
  }

  // 空状态的锦上添花,失败退回空数组,前端照常显示提示文案
  @Get('top')
  async top(): Promise<{ locations: NormalizedLocation[] }> {
    try {
      return { locations: await this.geoService.top() };
    } catch (error) {
      this.logger.warn(`热门城市获取失败: ${error instanceof Error ? error.message : String(error)}`);
      return { locations: [] };
    }
  }
}
