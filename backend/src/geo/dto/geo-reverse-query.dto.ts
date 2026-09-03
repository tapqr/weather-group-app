import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

export class GeoReverseQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}
