import { Controller, Get, Query, ValidationPipe } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { WeatherService } from './weather.service.js';
import { WeatherQueryDto } from './dto/weather-query.dto.js';
import { AggregatedWeatherResponse } from './interfaces/weather.interfaces.js';

@SkipThrottle({ geo: true })
@Controller('weather')
export class WeatherController {
  constructor(private readonly weatherService: WeatherService) {}

  @Get()
  getWeather(
    @Query(new ValidationPipe({ transform: true })) query: WeatherQueryDto,
  ): Promise<AggregatedWeatherResponse> {
    return this.weatherService.getAggregatedForecast({ lat: query.lat, lon: query.lon });
  }
}
