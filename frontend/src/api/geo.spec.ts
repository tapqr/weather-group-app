import { fetchReverseLocation, fetchTopLocations, searchLocations } from './geo';

const dongcheng = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

describe('geo api', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetchReverseLocation 请求 /geo/reverse 并取出 location', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ location: dongcheng }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReverseLocation(39.9042, 116.4074)).resolves.toEqual(dongcheng);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/geo\/reverse\?lat=39\.9042&lon=116\.4074$/),
    );
  });

  it('fetchReverseLocation 在后端返回 location:null 时给出 null', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ location: null }) });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReverseLocation(0, 0)).resolves.toBeNull();
  });

  it('fetchReverseLocation 在 HTTP 失败时也返回 null,不抛错 —— 地名不该打断天气流程', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReverseLocation(39.9042, 116.4074)).resolves.toBeNull();
  });

  it('searchLocations 对关键词做 URL 编码', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ locations: [dongcheng] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchLocations('北京')).resolves.toEqual([dongcheng]);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(encodeURIComponent('北京')));
  });

  it('searchLocations 在 HTTP 失败时抛错 —— 用户主动发起的操作必须有反馈', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchLocations('北京')).rejects.toThrow('HTTP 500');
  });

  it('fetchTopLocations 在 HTTP 失败时返回空数组,不抛错', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTopLocations()).resolves.toEqual([]);
  });

  it('fetchReverseLocation 在 fetch 本身 reject 时返回 null', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchReverseLocation(39.9042, 116.4074)).resolves.toBeNull();
  });

  it('fetchTopLocations 在 fetch 本身 reject 时返回空数组,不抛错', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTopLocations()).resolves.toEqual([]);
  });

  it('searchLocations 在 fetch 本身 reject 时向上抛错', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(searchLocations('北京')).rejects.toThrow('Network error');
  });
});
