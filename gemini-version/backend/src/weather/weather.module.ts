import { Module } from '@nestjs/common';
import { WeatherController } from './weather.controller';
import { WeatherService } from './weather.service';
import { CaiyunService } from './caiyun.service';
import { QWeatherService } from './qweather.service';
import { GeoService } from './geo.service';

@Module({
  controllers: [WeatherController],
  providers: [WeatherService, CaiyunService, QWeatherService, GeoService],
  exports: [WeatherService],
})
export class WeatherModule {}
