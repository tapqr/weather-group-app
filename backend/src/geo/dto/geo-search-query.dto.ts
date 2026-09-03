import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GeoSearchQueryDto {
  // 不设最小长度:单字搜索("北")是有效需求,和风自己会按 rank 排序返回最相关的结果。
  // 但要设一个上限:`geo:q:{关键词}` 与 `weather:{lat}:{lon}` 共用同一个容量有限的
  // LRU 缓存实例,用户可控的无界 key 能把为坐标设计的容量挤满
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  q: string;
}
