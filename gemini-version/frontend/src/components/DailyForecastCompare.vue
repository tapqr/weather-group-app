<script setup lang="ts">
import { DailyComparisonItem } from '../types/weather';
import WeatherIcon from './WeatherIcon.vue';
import { Calendar, CheckCircle, AlertCircle, AlertTriangle } from 'lucide-vue-next';

defineProps<{
  daily: DailyComparisonItem[];
}>();

const agreementBadge = (agreement: 'high' | 'moderate' | 'low') => {
  switch (agreement) {
    case 'high':
      return { text: '高度一致', class: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
    case 'moderate':
      return { text: '基本吻合', class: 'bg-amber-500/10 text-amber-400 border-amber-500/30' };
    case 'low':
      return { text: '分歧显著', class: 'bg-rose-500/10 text-rose-400 border-rose-500/30' };
  }
};
</script>

<template>
  <div class="rounded-2xl glass-card p-4 space-y-3">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2">
        <Calendar class="w-4 h-4 text-sky-400" />
        <span class="text-sm font-semibold text-slate-100">未来 {{ daily.length }} 天双源天气走势对比</span>
      </div>
      <div class="flex items-center gap-2 text-[11px] text-slate-400">
        <span class="text-sky-300">彩云</span>
        <span>vs</span>
        <span class="text-amber-300">和风</span>
      </div>
    </div>

    <!-- Daily Items -->
    <div class="divide-y divide-slate-800/80">
      <div
        v-for="(item, idx) in daily"
        :key="idx"
        class="py-2.5 flex items-center justify-between gap-2 hover:bg-slate-800/30 px-1 rounded-xl transition-colors"
      >
        <!-- Date / Weekday -->
        <div class="w-14 shrink-0">
          <div class="text-xs font-semibold text-slate-200">{{ item.weekday }}</div>
          <div class="text-[10px] text-slate-500">{{ item.date.slice(5) }}</div>
        </div>

        <!-- Caiyun Preview -->
        <div class="flex-1 flex items-center justify-start gap-1.5 p-1.5 rounded-lg bg-sky-950/20 border border-sky-900/30">
          <div class="text-sky-400 shrink-0">
            <WeatherIcon :name="item.caiyun.dayText.includes('雨') ? 'CloudRain' : item.caiyun.dayText.includes('多云') ? 'CloudSun' : item.caiyun.dayText.includes('阴') ? 'Cloud' : 'Sun'" :size="16" />
          </div>
          <div class="text-left">
            <div class="text-xs font-medium text-slate-200">
              {{ item.caiyun.minTemp }}°~{{ item.caiyun.maxTemp }}°
            </div>
            <div class="text-[10px] text-sky-300/80 truncate">{{ item.caiyun.dayText }}</div>
          </div>
        </div>

        <!-- Divider / Delta -->
        <div class="shrink-0 text-center px-1">
          <div
            class="text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap"
            :class="agreementBadge(item.agreement).class"
          >
            {{ agreementBadge(item.agreement).text }}
          </div>
        </div>

        <!-- QWeather Preview -->
        <div class="flex-1 flex items-center justify-start gap-1.5 p-1.5 rounded-lg bg-amber-950/20 border border-amber-900/30">
          <div class="text-amber-400 shrink-0">
            <WeatherIcon :name="item.qweather.dayText.includes('雨') ? 'CloudRain' : item.qweather.dayText.includes('多云') ? 'CloudSun' : item.qweather.dayText.includes('阴') ? 'Cloud' : 'Sun'" :size="16" />
          </div>
          <div class="text-left">
            <div class="text-xs font-medium text-slate-200">
              {{ item.qweather.minTemp }}°~{{ item.qweather.maxTemp }}°
            </div>
            <div class="text-[10px] text-amber-300/80 truncate">{{ item.qweather.dayText }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
