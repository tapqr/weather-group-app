import { fetchWeather } from './weather';

describe('fetchWeather', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the backend /weather endpoint with lat/lon and returns the parsed JSON', async () => {
    const aggregated = { results: [] };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(aggregated),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchWeather(39.92, 116.41);

    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/weather\?lat=39\.92&lon=116\.41$/));
    expect(result).toEqual(aggregated);
  });

  it('throws when the response is not ok', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWeather(39.92, 116.41)).rejects.toThrow('HTTP 500');
  });
});
