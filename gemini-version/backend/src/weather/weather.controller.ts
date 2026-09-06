import { Controller, Get, Query } from '@nestjs/common';
import { WeatherService } from './weather.service';
import { GeoService } from './geo.service';

@Controller('api/weather')
export class WeatherController {
  constructor(
    private readonly weatherService: WeatherService,
    private readonly geoService: GeoService,
  ) {}

  @Get('compare')
  async getComparison(
    @Query('city') city?: string,
    @Query('lat') lat?: string,
    @Query('lng') lng?: string,
  ) {
    return this.weatherService.getComparison(city, lat, lng);
  }

  @Get('cities')
  async getCities(@Query('q') query?: string) {
    if (query) {
      return this.geoService.searchCity(query);
    }
    return this.geoService.getPopularCities();
  }

  @Get('status')
  async getStatus() {
    return this.weatherService.getConfigStatus();
  }
}
