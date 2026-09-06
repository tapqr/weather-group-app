<script setup lang="ts">
import { MapPin, RefreshCw, Settings, Info } from 'lucide-vue-next';

defineProps<{
  city: string;
  loading: boolean;
  caiyunConfigured: boolean;
  qweatherConfigured: boolean;
}>();

defineEmits<{
  (e: 'selectCity'): void;
  (e: 'refresh'): void;
  (e: 'openSettings'): void;
}>();
</script>

<template>
  <header class="sticky top-0 z-30 px-4 py-3 bg-slate-900/80 backdrop-blur-md border-b border-slate-800 flex items-center justify-between">
    <!-- City Selection Button -->
    <button
      @click="$emit('selectCity')"
      class="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-800/90 hover:bg-slate-700/90 active:scale-95 transition-all text-white font-medium border border-slate-700/60 shadow-sm"
    >
      <MapPin class="w-4 h-4 text-sky-400" />
      <span class="text-base tracking-wide">{{ city || '选择城市' }}</span>
      <span class="text-xs text-slate-400 font-normal">切换</span>
    </button>

    <!-- Center Title / Source Tags -->
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-sky-950/60 border border-sky-800/40 text-sky-300">
        <span class="w-1.5 h-1.5 rounded-full" :class="caiyunConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-sky-400'"></span>
        <span>彩云</span>
      </div>
      <div class="text-[10px] text-slate-500 font-bold">VS</div>
      <div class="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-amber-950/60 border border-amber-800/40 text-amber-300">
        <span class="w-1.5 h-1.5 rounded-full" :class="qweatherConfigured ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'"></span>
        <span>和风</span>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex items-center gap-1.5">
      <button
        @click="$emit('refresh')"
        :disabled="loading"
        title="刷新天气"
        class="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-transform disabled:opacity-50"
      >
        <RefreshCw class="w-4 h-4" :class="{ 'animate-spin text-sky-400': loading }" />
      </button>
      <button
        @click="$emit('openSettings')"
        title="数据源设置与说明"
        class="p-2 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 active:scale-95 transition-transform"
      >
        <Info class="w-4 h-4 text-slate-300" />
      </button>
    </div>
  </header>
</template>
