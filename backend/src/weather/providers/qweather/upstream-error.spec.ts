import { describeUpstreamError } from './upstream-error.js';

describe('describeUpstreamError', () => {
  it('extracts the human-readable title/detail from a QWeather Error Code v2 axios error', () => {
    const axiosLikeError = {
      response: {
        data: {
          error: {
            status: 400,
            title: 'Invalid Parameter',
            detail: 'Invalid parameter, please check your request.',
          },
        },
      },
      message: 'Request failed with status code 400',
    };

    expect(describeUpstreamError(axiosLikeError)).toBe(
      'Invalid Parameter: Invalid parameter, please check your request.',
    );
  });

  it('falls back to error.message for a plain Error without an upstream error body', () => {
    expect(describeUpstreamError(new Error('network timeout'))).toBe('network timeout');
  });
});
