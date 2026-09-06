<script setup lang="ts">
import { computed } from 'vue';
import { ProviderWeatherRealtime } from '../types/weather';
import WeatherIcon from './WeatherIcon.vue';
import {
  Thermometer,
  Droplets,
  Wind,
  ShieldAlert,
  Gauge,
  Eye,
  CheckCircle2,
  CloudRain,
} from 'lucide-vue-next';

const props = defineProps<{
  caiyun: ProviderWeatherRealtime;
  qweather: ProviderWeatherRealtime;
  tempDiff: number;
  feelsLikeDiff: number;
}>();

const aqiBgClass = (cat: string) => {
  if (cat.includes('优')) return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
  if (cat.includes('良')) return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
  if (cat.includes('轻度')) return 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30';
  return 'bg-rose-500/20 text-rose-300 border-rose-500/30';
};
</script>

<template>
  <div class="space-y-3">
    <!-- Main Dual Cards -->
    <div class="grid grid-cols-2 gap-3">
      <!-- Caiyun Realtime Card -->
      <div class="rounded-2xl p-3.5 glass-card-caiyun flex flex-col justify-between relative overflow-hidden">
        <!-- Watermark / Brand Badge -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-sky-400"></span>
            <span class="text-xs font-bold text-sky-300">彩云天气</span>
          </div>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded"
            :class="caiyun.isMock ? 'bg-slate-800/80 text-slate-400' : 'bg-sky-500/20 text-sky-300'"
          >
            {{ caiyun.isMock ? '演练' : '实时' }}
          </span>
        </div>

        <!-- Temperature & Icon -->
        <div class="my-2 flex items-center justify-between">
          <div>
            <div class="text-4xl font-extrabold text-white tracking-tighter flex items-start">
              <span>{{ caiyun.temp }}</span>
              <span class="text-xl font-normal text-sky-300 ml-0.5">°C</span>
            </div>
            <div class="text-xs text-sky-200/80 mt-1 font-medium">
              体感 {{ caiyun.feelsLike }}°
            </div>
          </div>
          <div class="p-2.5 rounded-2xl bg-sky-400/10 text-sky-300 border border-sky-400/20">
            <WeatherIcon :name="caiyun.icon" :size="36" />
          </div>
        </div>

        <!-- Condition & Short description -->
        <div class="mt-1 flex items-center justify-between">
          <span class="text-sm font-semibold text-slate-100">{{ caiyun.text }}</span>
          <span class="text-[11px] text-slate-400">{{ caiyun.updateTime }} 更新</span>
        </div>
      </div>

      <!-- QWeather Realtime Card -->
      <div class="rounded-2xl p-3.5 glass-card-qweather flex flex-col justify-between relative overflow-hidden">
        <!-- Watermark / Brand Badge -->
        <div class="flex items-center justify-between mb-2">
          <div class="flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
            <span class="text-xs font-bold text-amber-300">和风天气</span>
          </div>
          <span
            class="text-[10px] px-1.5 py-0.5 rounded"
            :class="qweather.isMock ? 'bg-slate-800/80 text-slate-400' : 'bg-amber-500/20 text-amber-300'"
          >
            {{ qweather.isMock ? '演练' : '实时' }}
          </span>
        </div>

        <!-- Temperature & Icon -->
        <div class="my-2 flex items-center justify-between">
          <div>
            <div class="text-4xl font-extrabold text-white tracking-tighter flex items-start">
              <span>{{ qweather.temp }}</span>
              <span class="text-xl font-normal text-amber-300 ml-0.5">°C</span>
            </div>
            <div class="text-xs text-amber-200/80 mt-1 font-medium">
              体感 {{ qweather.feelsLike }}°
            </div>
          </div>
          <div class="p-2.5 rounded-2xl bg-amber-400/10 text-amber-300 border border-amber-400/20">
            <WeatherIcon :name="qweather.icon" :size="36" />
          </div>
        </div>

        <!-- Condition & Short description -->
        <div class="mt-1 flex items-center justify-between">
          <span class="text-sm font-semibold text-slate-100">{{ qweather.text }}</span>
          <span class="text-[11px] text-slate-400">{{ qweather.updateTime }} 更新</span>
        </div>
      </div>
    </div>

    <!-- Realtime Metric Comparison Table / Details Grid -->
    <div class="rounded-2xl glass-card p-3.5 space-y-2.5">
      <div class="text-xs font-semibold text-slate-300 px-1 flex items-center justify-between">
        <span>多指标细化对比</span>
        <span class="text-[11px] text-slate-500 font-normal">彩云 / 和风</span>
      </div>

      <!-- Metric Row: Humidity -->
      <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs">
        <div class="flex items-center gap-2 text-slate-400">
          <Droplets class="w-3.5 h-3.5 text-sky-400" />
          <span>相对湿度</span>
        </div>
        <div class="flex items-center gap-3 font-medium">
          <span class="text-sky-300">{{ caiyun.humidity }}%</span>
          <span class="text-slate-600">/</span>
          <span class="text-amber-300">{{ qweather.humidity }}%</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 ml-1">
            差 {{ Math.abs(caiyun.humidity - qweather.humidity) }}%
          </span>
        </div>
      </div>

      <!-- Metric Row: Wind -->
      <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs">
        <div class="flex items-center gap-2 text-slate-400">
          <Wind class="w-3.5 h-3.5 text-teal-400" />
          <span>风向风力</span>
        </div>
        <div class="flex items-center gap-2 font-medium">
          <span class="text-sky-300">{{ caiyun.windDir }} {{ caiyun.windScale }}</span>
          <span class="text-slate-600">/</span>
          <span class="text-amber-300">{{ qweather.windDir }} {{ qweather.windScale }}</span>
        </div>
      </div>

      <!-- Metric Row: AQI -->
      <div class="flex items-center justify-between p-2 rounded-xl bg-slate-900/50 border border-slate-800/60 text-xs">
        <div class="flex items-center gap-2 text-slate-400">
          <ShieldAlert class="w-3.5 h-3.5 text-emerald-400" />
          <span>空气质量 (AQI)</span>
        </div>
        <div class="flex items-center gap-2 font-medium">
          <span class="px-2 py-0.5 rounded text-[11px] border" :class="aqiBgClass(caiyun.aqi.category)">
            彩云 {{ caiyun.aqi.value }} ({{ caiyun.aqi.category }})
          </span>
          <span class="px-2 py-0.5 rounded text-[11px] border" :class="aqiBgClass(qweather.aqi.category)">
            和风 {{ qweather.aqi.value }} ({{ qweather.aqi.category }})
          </span>
        </div>
      </div>

      <!-- Metric Row: Pressure & Visibility -->
      <div class="grid grid-cols-2 gap-2 pt-1 text-[11px]">
        <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800/40">
          <span class="text-slate-400">气压</span>
          <span class="text-slate-200">{{ caiyun.pressure }} / {{ qweather.pressure }} hPa</span>
        </div>
        <div class="flex items-center justify-between p-2 rounded-lg bg-slate-900/40 border border-slate-800/40">
          <span class="text-slate-400">能见度</span>
          <span class="text-slate-200">{{ caiyun.visibility }} / {{ qweather.visibility }} km</span>
        </div>
      </div>
    </div>
  </div>
</template>
