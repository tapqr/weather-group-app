/**
 * 蒲福风级(Beaufort scale)换算:km/h → 0~12 级。
 *
 * 为什么需要它:和风 v1 的 `current.wind.scale` 是上游直接给的等级(实测 3),
 * 彩云的 `realtime.wind` 只有 `{ speed, direction }` —— **没有等级字段**(2026-09-07 实测)。
 * 两家的风力等级要并排展示,彩云那一侧只能从风速反算。
 *
 * 下面是国际标准的等级上界(km/h),不是估算值。判定用"小于等于上界"取最低满足的等级,
 * 超过最后一档(117 km/h)即 12 级 —— 12 级以上(飓风分级)对天气预报展示没有意义,不细分。
 */
const BEAUFORT_UPPER_BOUNDS_KPH = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117] as const;

/**
 * 把 km/h 风速换算成蒲福风力等级。
 *
 * 传 null / NaN / 负数都返回 null(而不是 0 级)—— 0 级是"无风"这个真实观测结果,
 * 和"没拿到风速"是两件事,混起来会让前端把缺失数据显示成"无风"。
 */
export function kphToBeaufortScale(kph: number | null): number | null {
  if (kph === null || !Number.isFinite(kph) || kph < 0) {
    return null;
  }
  const index = BEAUFORT_UPPER_BOUNDS_KPH.findIndex((bound) => kph <= bound);
  return index === -1 ? 12 : index;
}
