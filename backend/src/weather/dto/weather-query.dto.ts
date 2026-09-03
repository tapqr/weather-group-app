import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude } from 'class-validator';

export class WeatherQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lon: number;
}
