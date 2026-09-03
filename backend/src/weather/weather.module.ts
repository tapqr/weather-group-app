import { Module } from '@nestjs/common';
import { ProvidersModule } from './providers/providers.module.js';
import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';

@Module({
  imports: [ProvidersModule],
  controllers: [WeatherController],
  providers: [WeatherService],
})
export class WeatherModule {}
