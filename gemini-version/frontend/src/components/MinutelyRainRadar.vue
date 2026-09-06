<script setup lang="ts">
import { computed } from 'vue';
import { MinutelyRainData } from '../types/weather';
import { CloudRain, Radio, ShieldCheck } from 'lucide-vue-next';

const props = defineProps<{
  caiyunRain: MinutelyRainData;
  qweatherSummary?: string;
}>();

const hasRain = computed(() => {
  return props.caiyunRain?.radarRainList?.some((val) => val > 0.05);
});
</script>

<template>
  <div class="rounded-2xl glass-card p-4 space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Radio class="w-4 h-4 text-sky-400 animate-pulse" />
        <span class="text-sm font-semibold text-slate-100">两小时短临分钟级降水预报</span>
      </div>
      <span
        class="text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1"
        :class="hasRain ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'"
      >
        <component :is="hasRain ? CloudRain : ShieldCheck" class="w-3 h-3" />
        <span>{{ hasRain ? '雷达监测有雨' : '无降水信号' }}</span>
      </span>
    </div>

    <!-- Provider Statements -->
    <div class="space-y-2 text-xs">
      <div class="p-2.5 rounded-xl bg-sky-950/40 border border-sky-800/30 flex items-start gap-2">
        <span class="px-1.5 py-0.5 rounded bg-sky-600/30 text-sky-300 text-[10px] font-bold shrink-0">
          彩云雷达
        </span>
        <span class="text-slate-200 leading-relaxed">{{ caiyunRain.summary }}</span>
      </div>

      <div class="p-2.5 rounded-xl bg-amber-950/30 border border-amber-800/20 flex items-start gap-2">
        <span class="px-1.5 py-0.5 rounded bg-amber-600/30 text-amber-300 text-[10px] font-bold shrink-0">
          和风判定
        </span>
        <span class="text-slate-300 leading-relaxed">{{ qweatherSummary || '和风预报未来时段平稳' }}</span>
      </div>
    </div>

    <!-- 120-minute Radar Intensity Timeline -->
    <div class="pt-2">
      <div class="text-[11px] text-slate-400 mb-1.5 flex justify-between">
        <span>未来 120 分钟降水强度模拟条</span>
        <span>0mm ~ 10mm/h</span>
      </div>
      
      <!-- Bars container -->
      <div class="h-10 bg-slate-900/80 rounded-xl p-1.5 flex items-end gap-1 border border-slate-800">
        <div
          v-for="(val, idx) in caiyunRain.radarRainList"
          :key="idx"
          class="flex-1 rounded-t-sm transition-all duration-300 relative group cursor-pointer"
          :style="{
            height: Math.max(12, Math.min(100, val * 120)) + '%',
            backgroundColor: val > 0.5 ? '#0284c7' : val > 0.1 ? '#38bdf8' : val > 0 ? '#7dd3fc' : '#334155',
          }"
        >
          <!-- Tooltip on hover/touch -->
          <div class="absolute -top-7 left-1/2 -translate-x-1/2 hidden group-hover:block bg-slate-800 text-[10px] text-white px-1.5 py-0.5 rounded shadow whitespace-nowrap z-10 border border-slate-700">
            {{ idx * 5 }}分: {{ val.toFixed(2) }}mm
          </div>
        </div>
      </div>

      <!-- Time ticks -->
      <div class="flex justify-between text-[10px] text-slate-500 mt-1 px-1">
        <span>现在</span>
        <span>30分钟</span>
        <span>60分钟</span>
        <span>90分钟</span>
        <span>120分钟</span>
      </div>
    </div>
  </div>
</template>
