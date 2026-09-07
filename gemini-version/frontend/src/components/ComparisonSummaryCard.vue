<script setup lang="ts">
import { computed } from 'vue';
import { WeatherComparisonAnalysis } from '../types/weather';
import { ShieldCheck, AlertTriangle, AlertCircle, Sparkles, Flame, Droplets } from 'lucide-vue-next';

const props = defineProps<{
  analysis: WeatherComparisonAnalysis;
  tempDiff: number;
  feelsLikeDiff: number;
}>();

const statusConfig = computed(() => {
  switch (props.analysis.consensusStatus) {
    case 'high':
      return {
        bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400',
        badgeBg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40',
        label: '双源高度一致',
        icon: ShieldCheck,
      };
    case 'moderate':
      return {
        bg: 'bg-amber-500/10 border-amber-500/30 text-amber-400',
        badgeBg: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
        label: '基本吻合',
        icon: AlertCircle,
      };
    case 'divergent':
      return {
        bg: 'bg-rose-500/10 border-rose-500/30 text-rose-400',
        badgeBg: 'bg-rose-500/20 text-rose-300 border border-rose-500/40',
        label: '存在明显分歧',
        icon: AlertTriangle,
      };
    default:
      return {
        bg: 'bg-sky-500/10 border-sky-500/30 text-sky-400',
        badgeBg: 'bg-sky-500/20 text-sky-300 border border-sky-500/40',
        label: '分析就绪',
        icon: Sparkles,
      };
  }
});
</script>

<template>
  <div class="rounded-2xl p-4 transition-all duration-300 border backdrop-blur-md shadow-lg" :class="statusConfig.bg">
    <!-- Header -->
    <div class="flex items-center justify-between mb-2.5">
      <div class="flex items-center gap-2">
        <Sparkles class="w-4 h-4 text-sky-400" />
        <span class="text-sm font-semibold tracking-wide text-slate-200">双源预报智能对比分析</span>
      </div>
      <div class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium" :class="statusConfig.badgeBg">
        <component :is="statusConfig.icon" class="w-3.5 h-3.5" />
        <span>{{ statusConfig.label }}</span>
      </div>
    </div>

    <!-- Consensus Summary text -->
    <p class="text-xs text-slate-300 leading-relaxed mb-3">
      {{ analysis.consensusText }}
    </p>

    <!-- Key Metrics Delta Bar -->
    <div class="grid grid-cols-2 gap-2 mb-3">
      <div class="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/80 flex items-center gap-2">
        <div class="p-1.5 rounded-lg bg-orange-500/10 text-orange-400">
          <Flame class="w-4 h-4" />
        </div>
        <div>
          <div class="text-[11px] text-slate-400">实时气温差异</div>
          <div class="text-xs font-semibold text-slate-200">
            {{ analysis.tempDifferenceDesc }}
          </div>
        </div>
      </div>

      <div class="bg-slate-900/60 rounded-xl p-2.5 border border-slate-800/80 flex items-center gap-2">
        <div class="p-1.5 rounded-lg bg-sky-500/10 text-sky-400">
          <Droplets class="w-4 h-4" />
        </div>
        <div>
          <div class="text-[11px] text-slate-400">降雨预报状态</div>
          <div class="text-xs font-semibold text-slate-200 truncate" :title="analysis.rainDifferenceDesc">
            {{ analysis.rainDifferenceDesc }}
          </div>
        </div>
      </div>
    </div>

    <!-- Key Highlights / Alerts -->
    <div class="space-y-1.5 pt-1 border-t border-slate-700/40">
      <div
        v-for="(item, idx) in analysis.highlights"
        :key="idx"
        class="text-[11px] text-slate-300/90 leading-snug flex items-start gap-1.5"
      >
        <span>{{ item }}</span>
      </div>
    </div>
  </div>
</template>
