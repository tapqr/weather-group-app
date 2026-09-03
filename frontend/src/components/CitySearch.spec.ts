import { flushPromises, mount } from '@vue/test-utils';
import CitySearch from './CitySearch.vue';
import * as geoApi from '../api/geo';
import type { NormalizedLocation } from '../types/location';

const beijing: NormalizedLocation = {
  id: '101010100',
  name: '北京',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.9042,
  lon: 116.4074,
};
const chaoyangLn: NormalizedLocation = {
  id: '101071201',
  name: '朝阳',
  adm1: '辽宁省',
  adm2: '朝阳',
  lat: 41.576,
  lon: 120.446,
};
const chaoyangBj: NormalizedLocation = {
  id: '101010300',
  name: '朝阳',
  adm1: '北京市',
  adm2: '北京',
  lat: 39.9219,
  lon: 116.4435,
};

// 防抖靠计时器,必须用假计时器才能确定性地测
const openSearch = () => mount(CitySearch, { props: { open: true } });

describe('CitySearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(geoApi, 'fetchTopLocations').mockResolvedValue([beijing]);
    vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('打开时展示热门城市作为空状态', async () => {
    const wrapper = openSearch();
    await flushPromises();

    expect(geoApi.fetchTopLocations).toHaveBeenCalled();
    expect(wrapper.text()).toContain('北京');
  });

  it('热门城市获取失败时退回提示文案,不显示错误', async () => {
    vi.spyOn(geoApi, 'fetchTopLocations').mockResolvedValue([]);

    const wrapper = openSearch();
    await flushPromises();

    expect(wrapper.text()).toContain('输入城市名开始搜索');
  });

  it('输入后要等 300ms 才发请求,期间连续输入只发一次', async () => {
    const searchSpy = vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([beijing]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北');
    await wrapper.find('input').setValue('北京');
    expect(searchSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(searchSpy).toHaveBeenCalledWith('北京');
  });

  it('渲染搜索结果,同名地点靠上级城市区分', async () => {
    vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([chaoyangLn, chaoyangBj]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('朝阳');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    const items = wrapper.findAll('li');
    expect(items).toHaveLength(2);
    // formatLocationName:name === adm2 时只显示 name,不同则显示「市·区」
    expect(items[0].text()).toContain('朝阳');
    expect(items[1].text()).toContain('北京·朝阳');
    // 副标题用省级区分辽宁的朝阳和北京的朝阳
    expect(items[0].text()).toContain('辽宁省');
  });

  it('点击结果时 emit 完整的地点对象', async () => {
    vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([beijing]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北京');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    await wrapper.find('li button').trigger('click');

    expect(wrapper.emitted('select')![0][0]).toEqual(beijing);
  });

  it('丢弃过期响应:先发的请求后返回,不得覆盖更新的结果', async () => {
    let resolveSlow: (v: NormalizedLocation[]) => void = () => {};
    const slow = new Promise<NormalizedLocation[]>((r) => {
      resolveSlow = r;
    });
    vi.spyOn(geoApi, 'searchLocations')
      .mockReturnValueOnce(slow)
      .mockResolvedValueOnce([chaoyangBj]);

    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北');
    await vi.advanceTimersByTimeAsync(300);
    await wrapper.find('input').setValue('朝阳');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    // 第二个请求已经返回并渲染
    expect(wrapper.text()).toContain('北京·朝阳');

    // 第一个请求这时才姗姗来迟,必须被丢弃
    resolveSlow([beijing]);
    await flushPromises();

    expect(wrapper.text()).toContain('北京·朝阳');
    expect(wrapper.findAll('li')).toHaveLength(1);
  });

  it('搜索失败时给出可重试的提示', async () => {
    vi.spyOn(geoApi, 'searchLocations').mockRejectedValue(new Error('HTTP 500'));
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('北京');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(wrapper.text()).toContain('搜索失败');
    // 不把上游/HTTP 细节暴露给用户
    expect(wrapper.text()).not.toContain('HTTP 500');
  });

  it('清空输入时回到热门城市,并且不再发请求', async () => {
    const searchSpy = vi.spyOn(geoApi, 'searchLocations').mockResolvedValue([chaoyangBj]);
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('input').setValue('朝阳');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();
    expect(searchSpy).toHaveBeenCalledTimes(1);

    await wrapper.find('input').setValue('');
    await vi.advanceTimersByTimeAsync(300);
    await flushPromises();

    expect(searchSpy).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain('北京');
  });

  it('关闭时不渲染任何东西', () => {
    const wrapper = mount(CitySearch, { props: { open: false } });
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('点击取消时 emit close', async () => {
    const wrapper = openSearch();
    await flushPromises();

    await wrapper.find('.city-search__cancel').trigger('click');

    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
