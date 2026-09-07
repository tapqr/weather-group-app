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

export interface TempTick {
  value: number;
  label: string;
}

export interface TempAxis {
  /** 绘图下界(已含留白),不等于数据最小值 */
  min: number;
  /** 绘图上界(已含留白) */
  max: number;
  /** max - min,保证大于 0 */
  span: number;
  /** 从上到下的刻度 */
  ticks: TempTick[];
}

/** 上下各留这么多度的空白,免得曲线贴着画布边缘 */
const TEMP_AXIS_PADDING_C = 1;

/**
 * 由温度数据算出 y 轴。
 *
 * **刻意不做"整齐刻度"(nice scale)。** 把范围对齐到 5 或 10 的倍数当然更好看,
 * 但那会白扩张纵向范围:实测北京当天温度跨度 19.96~28.86(约 8.9°),对齐到 5 的
 * 倍数就变成 15~30 共 15°,曲线只占画布高度的 59% —— 两家相差 1° 时的垂直距离
 * 从 9px 压到 5px。这个图存在的全部理由就是让两家的差异可辨,压扁它等于削弱核心价值。
 * 所以用数据真实范围 + 固定 1° 留白,刻度值照实取整显示。
 *
 * 只给三档(最高/中位/最低):再多在 168px 高的画布上就开始叠字,而且逐时曲线
 * 要读的是趋势和两条线的间距,不是精确数值 —— 精确数值由读数条负责。
 */
export function buildTempAxis(values: Array<number | null>): TempAxis | null {
  const real = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (real.length === 0) return null;

  const dataMin = Math.min(...real);
  const dataMax = Math.max(...real);
  const min = dataMin - TEMP_AXIS_PADDING_C;
  const max = dataMax + TEMP_AXIS_PADDING_C;
  const span = max - min;

  // 三档的标签不会重复,所以不需要去重分支:留白让 span 至少是 2°,三档间距至少 1°,
  // 而间距恰好 1 的两个数不可能落进同一个取整区间([n-0.5, n+0.5) 宽度正好是 1,
  // 半开半闭),所以取整后必然互不相同 —— 哪怕原始数据全部同温
  const mid = (min + max) / 2;
  const ticks = [max, mid, min].map((value) => ({ value, label: `${Math.round(value)}°` }));

  return { min, max, span, ticks };
}
