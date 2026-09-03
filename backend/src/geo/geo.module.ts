import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { GeoController } from './geo.controller.js';
import { GeoService } from './geo.service.js';
import { QWeatherGeoProvider } from './providers/qweather-geo.provider.js';

@Module({
  imports: [HttpModule],
  controllers: [GeoController],
  providers: [GeoService, QWeatherGeoProvider],
})
export class GeoModule {}
