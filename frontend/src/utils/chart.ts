/*
 * 曲线的纯几何计算。
 *
 * 从 HourlyTrendChart.vue 里抽出来,不只是为了组件更薄 —— 是因为这些逻辑
 * 在 jsdom 里隔着 DOM 测不了:jsdom 不做布局,getBoundingClientRect() 恒返回 0,
 * PointerEvent 的 clientX 还是只读的。抽成纯函数后可以直接喂数字断言,
 * 而组件测试只负责"有没有渲染出对应的元素"。
 */

/** 折线在垂直方向的可用区间,由调用方按画布高度算好传进来 */
export interface VerticalScale {
  /** 数据里的最小值映射到的 y(像素) */
  bottomY: number;
  /** 数据里的最大值映射到的 y(像素) */
  topY: number;
  min: number;
  /** max - min,调用方保证不为 0 */
  span: number;
}

/**
 * 把指针的横向位置(相对元素宽度的比例)换算成时刻索引。
 *
 * 比例可能落在 [0,1] 之外(手指划出元素范围)或是 NaN(宽度为 0,比如元素还没布局),
 * 都必须夹回合法索引 —— 让 NaN 流进去会把选中态整个弄坏。
 */
export function hourIndexFromRatio(ratio: number, count: number): number {
  if (count <= 0 || !Number.isFinite(ratio)) return 0;
  return Math.max(0, Math.min(Math.floor(ratio * count), count - 1));
}

/**
 * 生成折线的 SVG path。
 *
 * 遇到 null 就断笔(下一个有值的点重新以 M 起手),而不是跨过去连一条直线 ——
 * 两家覆盖的时间窗不重合时(实测起始时刻差一小时)那一段确实没有数据,
 * 连过去等于凭空替那家补了一个它没给出的预报值。
 *
 * 这也是用 <path> 而不是 <polyline> 的唯一理由:polyline 无法断开。
 */
export function buildLinePath(
  values: Array<number | null>,
  xOf: (index: number) => number,
  yOf: (value: number) => number,
): string {
  let path = '';
  let penDown = false;
  values.forEach((value, index) => {
    if (value === null) {
      penDown = false;
      return;
    }
    path += `${penDown ? 'L' : 'M'}${xOf(index).toFixed(1)} ${yOf(value).toFixed(1)}`;
    penDown = true;
  });
  return path;
}

/**
 * 找出"所有序列都有值"的第一个索引,作为读数条的默认位置。
 *
 * 不能直接用 0:第一格往往只有一家有数据,停在那里读数条会显示"某家 —°",
 * 让人误以为那家整个没返回数据。没有任何一个索引是齐全的(时间窗完全不相交)
 * 就返回 0 —— 总得显示点什么。
 */
export function firstCompleteIndex(series: Array<Array<number | null>>, length: number): number {
  if (series.length === 0) return 0;
  for (let index = 0; index < length; index += 1) {
    if (series.every((values) => values[index] !== null && values[index] !== undefined)) {
      return index;
    }
  }
  return 0;
}
