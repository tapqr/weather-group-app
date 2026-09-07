<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { AlignedHourly } from '../utils/consensus';
import { buildLinePath, firstCompleteIndex, hourIndexFromRatio } from '../utils/chart';
import { formatTemperature } from '../utils/weather-display';

/*
 * 逐时气温对比曲线。各数据源叠在同一张图上 —— 这个产品的命题就是"看分歧",
 * 而分歧在两条线之间的垂直距离里最直观。
 *
 * 为什么手写 SVG 而不引图表库:页面的昼夜双主题是 CSS 变量驱动的
 * (:root[data-daypart] 换整套配色),而 ECharts / uPlot 都是 canvas 渲染,
 * 拿不到 CSS 变量,得额外写一层"监听主题变化 → 重新 setOption"的胶水。
 * SVG 的 stroke 直接写 var(--...) 就跟着主题走,零依赖零胶水。详见 docs/adr/0001。
 *
 * 卡片里那份横向滚动的逐时列表**保留**,两者分工:曲线看趋势和分歧,列表看天气文案
 * (文案在曲线上放不下)。
 */
const props = defineProps<{ hourly: AlignedHourly }>();

/** 每个时刻占的横向像素。24 点约 720px,在手机上横向滚动 —— 与卡片里那份列表一致的交互 */
const STEP = 32;
const HEIGHT = 168;
const PAD_TOP = 26;
const PAD_BOTTOM = 34;
/** 降水概率柱占据底部这么高,与温度曲线共用画布但不共用刻度 */
const POP_BAND = 26;

const chartWidth = computed(() => Math.max(props.hourly.axis.length * STEP, STEP));

/** 温度刻度取所有数据源的并集范围,两条线才在同一根标尺上可比 */
const tempRange = computed(() => {
  const values = props.hourly.series.flatMap((s) => s.temps).filter((t): t is number => t !== null);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // span 为 0(所有时刻同温)时给 1,避免除零把所有点挤到同一行
  return { min, max, span: max - min || 1 };
});

function xOf(index: number): number {
  return index * STEP + STEP / 2;
}

function yOf(tempC: number): number {
  const range = tempRange.value!;
  const usable = HEIGHT - PAD_TOP - PAD_BOTTOM - POP_BAND;
  return PAD_TOP + ((range.max - tempC) / range.span) * usable;
}

// 断线逻辑在 utils/chart.ts 里(那里能直接对数字断言;jsdom 不做布局,
// 隔着 DOM 测坐标是测不了的)
const linePaths = computed(() =>
  props.hourly.series.map((series) => ({
    provider: series.provider,
    label: series.label,
    d: buildLinePath(series.temps, xOf, yOf),
  })),
);

/** 降水概率柱。同一时刻多家并排,不叠加 —— 叠加会让人误读成累计概率 */
const popBars = computed(() => {
  const count = props.hourly.series.length || 1;
  const barWidth = Math.max((STEP - 10) / count, 2);
  return props.hourly.series.flatMap((series, seriesIndex) =>
    series.pops
      .map((pop, index) => {
        if (pop === null || pop <= 0) return null;
        const height = (pop / 100) * POP_BAND;
        return {
          key: `${series.provider}-${index}`,
          provider: series.provider,
          x: xOf(index) - (barWidth * count) / 2 + barWidth * seriesIndex,
          y: HEIGHT - PAD_BOTTOM - height,
          width: barWidth,
          height,
        };
      })
      .filter((bar): bar is NonNullable<typeof bar> => bar !== null),
  );
});

/** x 轴刻度:每 3 小时一个,24 点给 8 个标签,再密就叠字了 */
const visibleTicks = computed(() =>
  props.hourly.axis.map((tick, index) => ({ ...tick, index, show: index % 3 === 0 })),
);

/*
 * 交互刻意做成"图上方的固定读数条"而不是跟随手指的浮动 tooltip:
 * 浮层在窄屏上要处理左右溢出、遮挡曲线、以及横向滚动容器里的坐标换算,
 * 而固定读数条信息量完全一样,还更好读。
 */
// null 表示"用户还没选过",此时用 defaultIndex。切换城市时重置回 null ——
// 索引在新数据里指向的是另一个时刻,留着上一个城市的选择没有意义
const activeIndex = ref<number | null>(null);

/**
 * 默认落在**所有数据源都有数据**的第一个时刻。
 *
 * 不能直接用 0:两家覆盖的时间窗常常不重合(实测起始时刻差一小时),第一格
 * 往往只有一家有数据。停在那里,读数条会显示"和风 —°",让人误以为和风整个没返回数据,
 * 而实际上它只是没有那一个小时的预报。
 *
 * 全程都没有任何一个时刻是所有家齐全的(比如两家时间窗完全不相交),就退回第一格。
 */
const defaultIndex = computed(() =>
  firstCompleteIndex(
    props.hourly.series.map((s) => s.temps),
    props.hourly.axis.length,
  ),
);

const resolvedIndex = computed(() => {
  const index = activeIndex.value ?? defaultIndex.value;
  return Math.max(0, Math.min(index, Math.max(props.hourly.axis.length - 1, 0)));
});

watch(
  () => props.hourly,
  () => {
    activeIndex.value = null;
  },
);

const activeReadings = computed(() => {
  const index = resolvedIndex.value;
  return {
    label: props.hourly.axis[index]?.label ?? '',
    items: props.hourly.series.map((series) => ({
      provider: series.provider,
      label: series.label,
      temp: series.temps[index],
      pop: series.pops[index],
    })),
  };
});

function onPointer(event: PointerEvent) {
  const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
  // rect 宽度就是 SVG 的渲染宽度(viewBox 与像素 1:1)。宽度为 0(元素还没布局)时
  // 这个比例是 NaN,由 hourIndexFromRatio 兜住
  activeIndex.value = hourIndexFromRatio(
    (event.clientX - rect.left) / rect.width,
    props.hourly.axis.length,
  );
}
</script>

<template>
  <section v-if="tempRange" class="trend">
    <header class="trend__head">
      <h2>逐时气温对比</h2>
      <div class="trend__readout">
        <span class="trend__readout-time">{{ activeReadings.label }}</span>
        <span
          v-for="item in activeReadings.items"
          :key="item.provider"
          class="trend__readout-item"
          :data-provider="item.provider"
        >
          <i class="trend__swatch" aria-hidden="true"></i>
          {{ item.label }}
          <strong>{{ formatTemperature(item.temp) }}°</strong>
          <em v-if="item.pop !== null && item.pop > 0">{{ item.pop }}%</em>
        </span>
      </div>
    </header>

    <div class="trend__scroll">
      <svg
        class="trend__svg"
        :width="chartWidth"
        :height="HEIGHT"
        :viewBox="`0 0 ${chartWidth} ${HEIGHT}`"
        role="img"
        aria-label="各数据源的逐时气温对比曲线"
        @pointermove="onPointer"
        @pointerdown="onPointer"
      >
        <!-- 选中时刻的竖向指示线 -->
        <line
          class="trend__cursor"
          :x1="xOf(resolvedIndex)"
          :x2="xOf(resolvedIndex)"
          :y1="PAD_TOP - 8"
          :y2="HEIGHT - PAD_BOTTOM"
        />

        <!-- 降水概率柱,画在温度线之下 -->
        <rect
          v-for="bar in popBars"
          :key="bar.key"
          class="trend__pop"
          :data-provider="bar.provider"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          rx="1"
        />

        <!-- 温度曲线,每家一条 -->
        <path
          v-for="line in linePaths"
          :key="line.provider"
          class="trend__line"
          :data-provider="line.provider"
          :d="line.d"
        />

        <!-- 选中时刻的圆点 -->
        <template v-for="series in hourly.series" :key="`dot-${series.provider}`">
          <circle
            v-if="series.temps[resolvedIndex] !== null && series.temps[resolvedIndex] !== undefined"
            class="trend__dot"
            :data-provider="series.provider"
            :cx="xOf(resolvedIndex)"
            :cy="yOf(series.temps[resolvedIndex] as number)"
            r="3.4"
          />
        </template>

        <!-- x 轴时刻 -->
        <text
          v-for="tick in visibleTicks"
          :key="tick.hourKey"
          v-show="tick.show"
          class="trend__tick"
          :x="xOf(tick.index)"
          :y="HEIGHT - 12"
          text-anchor="middle"
        >
          {{ tick.label.slice(0, 2) }}时
        </text>
      </svg>
    </div>
  </section>
</template>

<style scoped>
.trend {
  border-radius: var(--radius-card);
  border: 1px solid var(--card-border);
  background: linear-gradient(150deg, rgba(13, 36, 54, 0.07), rgba(13, 36, 54, 0.03));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  padding: 14px 0 4px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:root[data-daypart='night'] .trend {
  background: linear-gradient(150deg, rgba(4, 8, 24, 0.28), rgba(4, 8, 24, 0.18));
}

.trend__head {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.trend__head h2 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.trend__readout {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px 14px;
  font-size: 13px;
  color: var(--ink-dim);
}

.trend__readout-time {
  font-variant-numeric: tabular-nums;
  color: var(--ink);
  font-weight: 600;
}

.trend__readout-item {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
}

.trend__readout-item strong {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

/* 降水概率跟在温度后面,用括号弱化 —— 它是次要信息 */
.trend__readout-item em {
  font-style: normal;
  font-size: 11px;
  color: var(--ink-faint);
}

.trend__readout-item em::before {
  content: '雨 ';
}

.trend__swatch {
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: var(--series-fallback);
  align-self: center;
}

.trend__scroll {
  overflow-x: auto;
  scrollbar-width: none;
  padding: 0 16px;
}

.trend__scroll::-webkit-scrollbar {
  display: none;
}

.trend__svg {
  display: block;
  touch-action: pan-x;
}

.trend__line {
  fill: none;
  stroke: var(--series-fallback);
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.trend__dot {
  fill: var(--series-fallback);
  stroke: var(--sky-via);
  stroke-width: 1.5;
}

.trend__pop {
  fill: var(--series-fallback);
  opacity: 0.28;
}

.trend__cursor {
  stroke: var(--ink-faint);
  stroke-width: 1;
  stroke-dasharray: 2 3;
}

.trend__tick {
  fill: var(--ink-faint);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

/*
 * 每家一个颜色。用 [data-provider] 而不是在 JS 里传色值,这样颜色定义
 * 全部留在 CSS 里,昼夜主题切换时自动跟着变(见 style.css 的 --series-*)
 */
.trend__line[data-provider='caiyun'],
.trend__dot[data-provider='caiyun'],
.trend__pop[data-provider='caiyun'] {
  stroke: var(--series-caiyun);
  fill: none;
}

.trend__line[data-provider='qweather'],
.trend__dot[data-provider='qweather'],
.trend__pop[data-provider='qweather'] {
  stroke: var(--series-qweather);
  fill: none;
}

.trend__dot[data-provider='caiyun'],
.trend__pop[data-provider='caiyun'] {
  fill: var(--series-caiyun);
}

.trend__dot[data-provider='qweather'],
.trend__pop[data-provider='qweather'] {
  fill: var(--series-qweather);
}

.trend__readout-item[data-provider='caiyun'] .trend__swatch {
  background: var(--series-caiyun);
}

.trend__readout-item[data-provider='qweather'] .trend__swatch {
  background: var(--series-qweather);
}
</style>
