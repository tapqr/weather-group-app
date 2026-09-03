import { assertRequiredConfig } from './validate-required-config.js';

function fakeConfigService(values: Record<string, string>) {
  return { get: (key: string) => values[key] } as { get: (key: string) => string | undefined };
}

describe('assertRequiredConfig', () => {
  it('does not throw when all required credentials are present', () => {
    const configService = fakeConfigService({
      'qweather.apiHost': 'abc123.re.qweatherapi.com',
      'qweather.apiKey': 'qw-key',
      'caiyun.token': 'cy-token',
    });

    expect(() => assertRequiredConfig(configService)).not.toThrow();
  });

  it('throws naming the missing environment variable(s), without leaking any configured value', () => {
    const configService = fakeConfigService({
      'qweather.apiHost': '',
      'qweather.apiKey': 'qw-key',
      'caiyun.token': '',
    });

    let caught: unknown;
    try {
      assertRequiredConfig(configService);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain('QWEATHER_API_HOST');
    expect(message).toContain('CAIYUN_TOKEN');
    expect(message).not.toContain('QWEATHER_API_KEY');
    expect(message).not.toContain('qw-key');
  });
});
