import { buildLinePath, firstCompleteIndex, hourIndexFromRatio } from './chart';

const xOf = (i: number) => i * 10;
const yOf = (v: number) => 100 - v;

describe('buildLinePath', () => {
  it('draws one continuous segment when every point has a value', () => {
    expect(buildLinePath([20, 21, 22], xOf, yOf)).toBe('M0.0 80.0L10.0 79.0L20.0 78.0');
  });

  /*
   * 断线是这个函数存在的理由。两家覆盖的时间窗不重合时(实测起始时刻差一小时),
   * 缺数据那一段必须断开 —— 跨过去连一条直线等于凭空替那家补了它没给的预报值。
   */
  it('lifts the pen at a gap instead of bridging across it', () => {
    // 中间缺一个 → 两段,各自以 M 起手
    expect(buildLinePath([20, null, 22], xOf, yOf)).toBe('M0.0 80.0M20.0 78.0');
  });

  it('starts the line at the first real value when the series begins with gaps', () => {
    expect(buildLinePath([null, null, 22], xOf, yOf)).toBe('M20.0 78.0');
  });

  it('ends the line at the last real value when the series ends with gaps', () => {
    expect(buildLinePath([20, 21, null], xOf, yOf)).toBe('M0.0 80.0L10.0 79.0');
  });

  it('produces several segments for several gaps', () => {
    const path = buildLinePath([20, null, 22, 23, null, 25], xOf, yOf);
    expect(path.match(/M/g)).toHaveLength(3);
    expect(path.match(/L/g)).toHaveLength(1);
  });

  it('returns an empty path when nothing has a value', () => {
    expect(buildLinePath([null, null], xOf, yOf)).toBe('');
  });

  it('keeps a single point as a lone M command', () => {
    // 只有一个数据点时画不出线段,但起手点仍要在,否则圆点标记会没有依附
    expect(buildLinePath([20], xOf, yOf)).toBe('M0.0 80.0');
  });
});

describe('hourIndexFromRatio', () => {
  it('maps a ratio across the width to the matching slot', () => {
    expect(hourIndexFromRatio(0, 24)).toBe(0);
    expect(hourIndexFromRatio(0.5, 24)).toBe(12);
    // 0.999… 仍在最后一格内
    expect(hourIndexFromRatio(0.99, 24)).toBe(23);
  });

  it('clamps a ratio that runs past either end', () => {
    // 手指划出元素范围时不能算出越界索引
    expect(hourIndexFromRatio(-0.3, 24)).toBe(0);
    expect(hourIndexFromRatio(1, 24)).toBe(23);
    expect(hourIndexFromRatio(2.5, 24)).toBe(23);
  });

  it('returns 0 rather than NaN when the element has no measurable width', () => {
    // 元素还没布局时 rect.width 是 0,除法给出 NaN。
    // 让 NaN 流进选中态会把整个高亮弄坏(NaN 参与比较永远为 false)
    expect(hourIndexFromRatio(Number.NaN, 24)).toBe(0);
    expect(hourIndexFromRatio(Number.POSITIVE_INFINITY, 24)).toBe(0);
  });

  it('returns 0 when there are no slots at all', () => {
    expect(hourIndexFromRatio(0.5, 0)).toBe(0);
  });
});

describe('firstCompleteIndex', () => {
  it('picks the first index where every series has a value', () => {
    // 实测场景:彩云从 15:00 起、和风从 16:00 起 → 默认应落在第 1 格(16:00)
    expect(firstCompleteIndex([[28, 27, 26], [null, 28, 27]], 3)).toBe(1);
  });

  it('picks index 0 when it is already complete', () => {
    expect(firstCompleteIndex([[28, 27], [29, 28]], 2)).toBe(0);
  });

  it('falls back to 0 when no index is complete', () => {
    // 时间窗完全不相交 —— 没有任何时刻是齐全的,但总得显示点什么
    expect(firstCompleteIndex([[28, null], [null, 24]], 2)).toBe(0);
  });

  it('treats a single series as complete wherever it has a value', () => {
    expect(firstCompleteIndex([[null, 27]], 2)).toBe(1);
  });

  it('falls back to 0 when there are no series', () => {
    expect(firstCompleteIndex([], 0)).toBe(0);
  });
});
