import { GeoService } from './geo.service.js';
import type { NormalizedLocation } from './interfaces/geo.interfaces.js';

const dongcheng: NormalizedLocation = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

function buildService(provider: Partial<Record<'reverse' | 'search' | 'top', any>>) {
  const store = new Map<string, unknown>();
  const cache = {
    get: vi.fn(async (key: string) => store.get(key)),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
  } as any;
  const configService = { get: () => 86400 } as any;
  const service = new GeoService(provider as any, cache, configService);
  return { service, cache, store };
}

describe('GeoService.reverse', () => {
  it('第一次打上游,第二次命中缓存', async () => {
    const reverse = vi.fn().mockResolvedValue(dongcheng);
    const { service } = buildService({ reverse });

    await expect(service.reverse(39.9042, 116.4074)).resolves.toEqual(dongcheng);
    await expect(service.reverse(39.9042, 116.4074)).resolves.toEqual(dongcheng);

    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it('写缓存时把 configService 给的秒数换算成毫秒传给 cache.set —— 这是 24h vs 30min 这个设计核心生效的地方', async () => {
    const reverse = vi.fn().mockResolvedValue(dongcheng);
    const { service, cache } = buildService({ reverse });

    await service.reverse(39.9042, 116.4074);

    expect(cache.set).toHaveBeenCalledTimes(1);
    expect(cache.set).toHaveBeenCalledWith(expect.any(String), expect.anything(), 86400 * 1000);
  });

  it('坐标取两位小数,微小抖动命中同一份缓存', async () => {
    const reverse = vi.fn().mockResolvedValue(dongcheng);
    const { service } = buildService({ reverse });

    await service.reverse(39.9042, 116.4074);
    await service.reverse(39.9041, 116.40739);

    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it('null 是有效结果,要缓存,不能每次都回源', async () => {
    const reverse = vi.fn().mockResolvedValue(null);
    const { service } = buildService({ reverse });

    await expect(service.reverse(0, 0)).resolves.toBeNull();
    await expect(service.reverse(0, 0)).resolves.toBeNull();

    expect(reverse).toHaveBeenCalledTimes(1);
  });

  it('上游失败不写缓存,下次仍然回源(24 小时 TTL 下不能固化一次抖动)', async () => {
    const reverse = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(dongcheng);
    const { service, cache } = buildService({ reverse });

    await expect(service.reverse(39.9042, 116.4074)).rejects.toThrow('boom');
    expect(cache.set).not.toHaveBeenCalled();

    await expect(service.reverse(39.9042, 116.4074)).resolves.toEqual(dongcheng);
    expect(reverse).toHaveBeenCalledTimes(2);
  });
});

describe('GeoService.search', () => {
  it('按关键词缓存,大小写和首尾空格归一到同一个 key', async () => {
    const search = vi.fn().mockResolvedValue([dongcheng]);
    const { service } = buildService({ search });

    await service.search('Xiamen');
    await service.search('  xiamen  ');

    expect(search).toHaveBeenCalledTimes(1);
  });

  it('空数组是有效结果,要缓存', async () => {
    const search = vi.fn().mockResolvedValue([]);
    const { service } = buildService({ search });

    await expect(service.search('不存在的地方')).resolves.toEqual([]);
    await expect(service.search('不存在的地方')).resolves.toEqual([]);

    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe('GeoService.top', () => {
  it('缓存热门城市', async () => {
    const top = vi.fn().mockResolvedValue([dongcheng]);
    const { service } = buildService({ top });

    await service.top();
    await service.top();

    expect(top).toHaveBeenCalledTimes(1);
  });
});

describe('GeoService 缓存 key 互不串扰', () => {
  it('reverse / search / top 各用各的 key', async () => {
    const provider = {
      reverse: vi.fn().mockResolvedValue(dongcheng),
      search: vi.fn().mockResolvedValue([]),
      top: vi.fn().mockResolvedValue([dongcheng]),
    };
    const { service, store } = buildService(provider);

    await service.reverse(39.9042, 116.4074);
    await service.search('北京');
    await service.top();

    expect([...store.keys()].sort()).toEqual(['geo:q:北京', 'geo:rev:39.90:116.41', 'geo:top']);
  });
});
