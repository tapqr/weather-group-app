import { WeatherController } from './weather.controller.js';
import { WeatherService } from './weather.service.js';

describe('WeatherController', () => {
  it('delegates to WeatherService.getAggregatedForecast with the parsed lat/lon', async () => {
    const aggregated = { results: [] };
    const weatherService = {
      getAggregatedForecast: vi.fn().mockResolvedValue(aggregated),
    } as unknown as WeatherService;
    const controller = new WeatherController(weatherService);

    const result = await controller.getWeather({ lat: 39.92, lon: 116.41 });

    expect(weatherService.getAggregatedForecast).toHaveBeenCalledWith({ lat: 39.92, lon: 116.41 });
    expect(result).toBe(aggregated);
  });
});
