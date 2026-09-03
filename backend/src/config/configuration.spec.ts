import configuration from './configuration.js';

describe('configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      PORT: '4000',
      CORS_ORIGIN: 'http://localhost:5173',
      WEATHER_CACHE_TTL_SECONDS: '900',
      WEATHER_CACHE_FAILURE_TTL_SECONDS: '30',
      QWEATHER_API_HOST: 'abc123.re.qweatherapi.com',
      QWEATHER_API_KEY: 'qw-key',
      CAIYUN_TOKEN: 'cy-token',
      THROTTLE_TTL_MS: '120000',
      THROTTLE_LIMIT: '60',
      GEO_CACHE_TTL_SECONDS: '43200',
      GEO_THROTTLE_TTL_MS: '30000',
      GEO_THROTTLE_LIMIT: '90',
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('reads provider credentials, cors origin, cache, and throttle settings from environment variables', () => {
    const config = configuration();
    expect(config).toEqual({
      port: 4000,
      corsOrigin: 'http://localhost:5173',
      cache: { ttlSeconds: 900, failureTtlSeconds: 30 },
      qweather: { apiHost: 'abc123.re.qweatherapi.com', apiKey: 'qw-key' },
      caiyun: { token: 'cy-token' },
      throttle: { ttlMs: 120000, limit: 60 },
      geo: { cacheTtlSeconds: 43200, throttleTtlMs: 30000, throttleLimit: 90 },
    });
  });
});
