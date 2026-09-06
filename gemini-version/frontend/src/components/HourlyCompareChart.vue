<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as echarts from 'echarts';
import { HourlyComparisonItem } from '../types/weather';
import WeatherIcon from './WeatherIcon.vue';
import { LineChart, ListFilter, AlertTriangle, Droplets } from 'lucide-vue-next';

const props = defineProps<{
  hourly: HourlyComparisonItem[];
}>();

const viewMode = ref<'chart' | 'list'>('chart');
const chartRef = ref<HTMLDivElement | null>(null);
let chartInstance: echarts.ECharts | null = null;

const initChart = () => {
  if (!chartRef.value) return;
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value);
  }

  const times = props.hourly.map((h) => h.time);
  const caiyunTemps = props.hourly.map((h) => h.caiyun.temp);
  const qweatherTemps = props.hourly.map((h) => h.qweather.temp);
  const caiyunPops = props.hourly.map((h) => h.caiyun.pop);

  const option: echarts.EChartsOption = {
    backgroundColor: 'transparent',
    grid: {
      top: 36,
      bottom: 28,
      left: 32,
      right: 16,
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(15, 23, 42, 0.95)',
      borderColor: '#334155',
      textStyle: {
        color: '#f8fafc',
        fontSize: 12,
      },
      formatter: (params: any) => {
        if (!Array.isArray(params) || params.length === 0) return '';
        const idx = params[0].dataIndex;
        const item = props.hourly[idx];
        return `
          <div style="font-weight: bold; margin-bottom: 4px; color: #94a3b8;">${item.time}</div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
            <span style="color: #38bdf8;">● 彩云天气</span>
            <span style="font-weight: 600;">${item.caiyun.temp}°C (${item.caiyun.text})</span>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 2px;">
            <span style="color: #fbbf24;">● 和风天气</span>
            <span style="font-weight: 600;">${item.qweather.temp}°C (${item.qweather.text})</span>
          </div>
          <div style="border-top: 1px solid #334155; margin-top: 4px; padding-top: 4px; font-size: 11px; color: #cbd5e1;">
            温差: ${Math.abs(item.tempDiff)}°C | 降水概率: ${item.caiyun.pop}% / ${item.qweather.pop}%
          </div>
        `;
      },
    },
    legend: {
      data: ['彩云温度', '和风温度'],
      textStyle: {
        color: '#94a3b8',
        fontSize: 11,
      },
      top: 0,
      right: 0,
    },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: '#334155' } },
      axisLabel: {
        color: '#94a3b8',
        fontSize: 10,
        interval: 3,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(51, 65, 85, 0.4)', type: 'dashed' } },
      axisLabel: {
        color: '#64748b',
        fontSize: 10,
        formatter: '{value}°',
      },
    },
    series: [
      {
        name: '彩云温度',
        type: 'line',
        smooth: true,
        data: caiyunTemps,
        itemStyle: { color: '#0284c7' },
        lineStyle: { width: 2.5, color: '#38bdf8' },
        showSymbol: false,
      },
      {
        name: '和风温度',
        type: 'line',
        smooth: true,
        data: qweatherTemps,
        itemStyle: { color: '#f59e0b' },
        lineStyle: { width: 2.5, color: '#fbbf24' },
        showSymbol: false,
      },
    ],
  };

  chartInstance.setOption(option);
};

const handleResize = () => {
  chartInstance?.resize();
};

watch(
  () => props.hourly,
  () => {
    if (viewMode.value === 'chart') {
      setTimeout(initChart, 50);
    }
  },
  { deep: true }
);

watch(viewMode, (newVal) => {
  if (newVal === 'chart') {
    setTimeout(initChart, 50);
  }
});

onMounted(() => {
  initChart();
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  chartInstance?.dispose();
  chartInstance = null;
});
</script>

<template>
  <div class="rounded-2xl glass-card p-4 space-y-3">
    <!-- Title & Mode Switcher -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <LineChart class="w-4 h-4 text-sky-400" />
        <span class="text-sm font-semibold text-slate-100">24小时逐时气温与降雨对比</span>
      </div>
      <div class="flex items-center p-0.5 rounded-lg bg-slate-800 border border-slate-700">
        <button
          @click="viewMode = 'chart'"
          class="px-2 py-1 rounded text-xs font-medium transition-all"
          :class="viewMode === 'chart' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'"
        >
          曲线
        </button>
        <button
          @click="viewMode = 'list'"
          class="px-2 py-1 rounded text-xs font-medium transition-all"
          :class="viewMode === 'list' ? 'bg-sky-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'"
        >
          列表
        </button>
      </div>
    </div>

    <!-- Chart View -->
    <div v-show="viewMode === 'chart'" class="w-full">
      <div ref="chartRef" class="w-full h-52"></div>
      <div class="flex items-center justify-between text-[11px] text-slate-400 px-1 border-t border-slate-800/80 pt-2">
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1">
            <span class="w-2.5 h-1 bg-sky-400 rounded-full inline-block"></span> 彩云气温
          </span>
          <span class="flex items-center gap-1">
            <span class="w-2.5 h-1 bg-amber-400 rounded-full inline-block"></span> 和风气温
          </span>
        </div>
        <span class="text-slate-500">点击/滑动曲线查看详情</span>
      </div>
    </div>

    <!-- List View (Horizontal scroll cards) -->
    <div v-show="viewMode === 'list'" class="flex gap-2 overflow-x-auto no-scrollbar py-1">
      <div
        v-for="(item, idx) in hourly"
        :key="idx"
        class="shrink-0 w-24 rounded-xl p-2.5 bg-slate-900/80 border text-center transition-all"
        :class="item.isDivergent ? 'border-amber-500/50 bg-amber-950/10' : 'border-slate-800'"
      >
        <div class="text-[11px] font-medium text-slate-400 mb-1">{{ item.time }}</div>

        <!-- Caiyun item -->
        <div class="p-1 rounded bg-sky-950/40 border border-sky-900/40 mb-1.5">
          <div class="flex items-center justify-center gap-1">
            <WeatherIcon :name="item.caiyun.icon" :size="14" class="text-sky-400" />
            <span class="text-xs font-bold text-sky-200">{{ item.caiyun.temp }}°</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">{{ item.caiyun.text }}</div>
        </div>

        <!-- QWeather item -->
        <div class="p-1 rounded bg-amber-950/40 border border-amber-900/40 mb-1.5">
          <div class="flex items-center justify-center gap-1">
            <WeatherIcon :name="item.qweather.icon" :size="14" class="text-amber-400" />
            <span class="text-xs font-bold text-amber-200">{{ item.qweather.temp }}°</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5 truncate">{{ item.qweather.text }}</div>
        </div>

        <!-- Divergence / Rain probability indicator -->
        <div class="text-[10px] flex items-center justify-center gap-1 text-slate-400">
          <Droplets class="w-3 h-3 text-sky-400" />
          <span>{{ item.caiyun.pop }}% / {{ item.qweather.pop }}%</span>
        </div>
      </div>
    </div>
  </div>
</template>
