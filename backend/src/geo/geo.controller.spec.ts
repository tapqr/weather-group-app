import { GeoController } from './geo.controller.js';
import type { NormalizedLocation } from './interfaces/geo.interfaces.js';

const dongcheng: NormalizedLocation = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

describe('GeoController', () => {
  it('reverse 成功时包在 location 字段里返回', async () => {
    const service = { reverse: vi.fn().mockResolvedValue(dongcheng) } as any;
    const controller = new GeoController(service);

    await expect(controller.reverse({ lat: 39.9042, lon: 116.4074 })).resolves.toEqual({
      location: dongcheng,
    });
  });

  it('reverse 遇到上游失败时吞掉异常返回 null —— 用户没主动要地名,不该为它报错', async () => {
    const service = { reverse: vi.fn().mockRejectedValue(new Error('upstream down')) } as any;
    const controller = new GeoController(service);

    await expect(controller.reverse({ lat: 39.9042, lon: 116.4074 })).resolves.toEqual({ location: null });
  });

  it('search 失败时向上抛 —— 用户主动发起的操作必须有反馈', async () => {
    const service = { search: vi.fn().mockRejectedValue(new Error('upstream down')) } as any;
    const controller = new GeoController(service);

    await expect(controller.search({ q: '北京' })).rejects.toThrow();
  });

  it('top 失败时吞掉异常返回空数组 —— 空状态的锦上添花', async () => {
    const service = { top: vi.fn().mockRejectedValue(new Error('upstream down')) } as any;
    const controller = new GeoController(service);

    await expect(controller.top()).resolves.toEqual({ locations: [] });
  });
});
