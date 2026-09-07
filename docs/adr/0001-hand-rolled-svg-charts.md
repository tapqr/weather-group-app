# 逐时曲线用手写 SVG,不引图表库

页面的昼夜双主题由 CSS 变量驱动(`:root[data-daypart]` 换整套配色),而 ECharts、uPlot 这类库都是 canvas 渲染 —— canvas 拿不到 CSS 变量,必须在 JS 里持有一份色值,再监听 `data-daypart` 变化去 `setOption` 重画。那层胶水是常驻的维护成本,而且一旦漏改就会出现"页面已经入夜、曲线还是白天配色"这种只在特定时段复现的问题。

手写 SVG 的 `stroke="var(--series-caiyun)"` 直接跟着主题走,零胶水。代价是 tooltip、缩放这些现成交互要自己写 —— 实际只需要一个"指针位置 → 时刻索引"的换算(`frontend/src/utils/chart.ts`),而且我们最终选了图上方的固定读数条而非浮动 tooltip,窄屏上还更好读。附带好处:前端产物维持在 91 kB(gzip 35 kB),引 ECharts 会是几百 KB 起。

## Consequences

曲线的几何计算集中在 `frontend/src/utils/chart.ts`,与组件分离 —— 不只是为了组件更薄,而是因为 jsdom 不做布局(`getBoundingClientRect()` 恒返回 0,`PointerEvent.clientX` 只读),隔着 DOM 根本测不了坐标换算。抽成纯函数后可以直接对数字断言。

要加的图表类型如果超出"折线 + 柱"(比如需要缩放、刷选、多轴联动),应当重新评估这个决定,而不是继续往手写 SVG 上堆。
