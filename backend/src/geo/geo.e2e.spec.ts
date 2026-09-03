import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module.js';
import { QWeatherGeoProvider } from './providers/qweather-geo.provider.js';
import type { NormalizedLocation } from './interfaces/geo.interfaces.js';

// 端到端契约测试:真正走 HTTP 层,覆盖 controller.spec 覆盖不到的 DTO 转换与校验。
// 用 .overrideProvider(QWeatherGeoProvider) 换成假 provider,不会真的打和风 API,
// 所以不需要 backend/.env 里的真实凭据。

const dongcheng: NormalizedLocation = {
  id: '101011600',
  name: '东城',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.91755,
  lon: 116.41876,
};

describe('GET /geo (e2e)', () => {
  let app: INestApplication<App>;
  let fakeProvider: {
    reverse: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    top: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    fakeProvider = {
      reverse: vi.fn().mockResolvedValue(dongcheng),
      search: vi.fn().mockResolvedValue([dongcheng]),
      top: vi.fn().mockResolvedValue([dongcheng]),
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(QWeatherGeoProvider)
      .useValue(fakeProvider)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reverse 把 query string 里的字符串坐标转成数字并返回地点', async () => {
    const response = await request(app.getHttpServer()).get('/geo/reverse?lat=39.9042&lon=116.4074').expect(200);

    expect(response.body).toEqual({ location: dongcheng });
    // DTO 必须把字符串转成 number,否则 provider 拿到的是 "39.9042"
    expect(fakeProvider.reverse).toHaveBeenCalledWith(39.9042, 116.4074);
  });

  it('reverse 缺参数返回 400', async () => {
    await request(app.getHttpServer()).get('/geo/reverse?lat=39.9042').expect(400);
  });

  it('reverse 坐标非法返回 400', async () => {
    await request(app.getHttpServer()).get('/geo/reverse?lat=999&lon=116.4074').expect(400);
  });

  it('reverse 在上游失败时仍返回 200 + location:null,不让前端进错误分支', async () => {
    fakeProvider.reverse.mockRejectedValue(new Error('upstream down'));

    const response = await request(app.getHttpServer()).get('/geo/reverse?lat=39.9042&lon=116.4074').expect(200);

    expect(response.body).toEqual({ location: null });
  });

  it('search 返回候选列表', async () => {
    const response = await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97%E4%BA%AC').expect(200);

    expect(response.body).toEqual({ locations: [dongcheng] });
    expect(fakeProvider.search).toHaveBeenCalledWith('北京');
  });

  it('search 单字关键词是有效请求,不设最小长度门槛', async () => {
    await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97').expect(200);

    expect(fakeProvider.search).toHaveBeenCalledWith('北');
  });

  it('search 缺 q 或 q 为空白返回 400', async () => {
    await request(app.getHttpServer()).get('/geo/search').expect(400);
    await request(app.getHttpServer()).get('/geo/search?q=%20%20').expect(400);
  });

  it('search 的 q 超过 32 字符返回 400 —— 防止用户可控的无界 key 挤占共享 LRU 缓存', async () => {
    const tooLong = 'a'.repeat(33);
    await request(app.getHttpServer()).get(`/geo/search?q=${tooLong}`).expect(400);
  });

  it('search 在上游失败时返回 5xx —— 用户主动发起的操作必须有反馈', async () => {
    fakeProvider.search.mockRejectedValue(new Error('upstream down'));

    await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97%E4%BA%AC').expect(500);
  });

  it('search 的错误响应体不含上游原始文本', async () => {
    fakeProvider.search.mockRejectedValue(new Error('API key is invalid: secret-token-leaked'));

    const response = await request(app.getHttpServer()).get('/geo/search?q=%E5%8C%97%E4%BA%AC').expect(500);

    expect(JSON.stringify(response.body)).not.toContain('secret-token-leaked');
  });

  it('top 返回热门城市', async () => {
    const response = await request(app.getHttpServer()).get('/geo/top').expect(200);

    expect(response.body).toEqual({ locations: [dongcheng] });
  });

  it('top 在上游失败时返回 200 + 空数组', async () => {
    fakeProvider.top.mockRejectedValue(new Error('upstream down'));

    const response = await request(app.getHttpServer()).get('/geo/top').expect(200);

    expect(response.body).toEqual({ locations: [] });
  });
});
