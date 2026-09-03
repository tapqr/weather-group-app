import { requestCurrentLocation } from './useGeolocation';

describe('requestCurrentLocation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves with lat/lon when the browser grants permission', async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => {
      success({ coords: { latitude: 39.92, longitude: 116.41 } } as GeolocationPosition);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    const result = await requestCurrentLocation();

    expect(result).toEqual({ lat: 39.92, lon: 116.41 });
  });

  it('rejects when the browser denies permission', async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) => {
      error({ message: 'User denied Geolocation' } as GeolocationPositionError);
    });
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });

    await expect(requestCurrentLocation()).rejects.toThrow('User denied Geolocation');
  });

  it('rejects when the browser does not support geolocation', async () => {
    vi.stubGlobal('navigator', {});

    await expect(requestCurrentLocation()).rejects.toThrow('该浏览器不支持定位');
  });
});
