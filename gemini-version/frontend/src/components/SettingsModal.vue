<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { weatherApi } from '../services/api';
import { ConfigStatusResponse } from '../types/weather';
import { X, Key, ShieldCheck, ExternalLink, Cpu, Check, Layers } from 'lucide-vue-next';

defineProps<{
  show: boolean;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const status = ref<ConfigStatusResponse | null>(null);

const loadStatus = async () => {
  try {
    status.value = await weatherApi.getStatus();
  } catch (err) {
    console.error(err);
  }
};

onMounted(() => {
  loadStatus();
});
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <!-- Backdrop -->
    <div
      @click="$emit('close')"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
    ></div>

    <!-- Modal Card -->
    <div
      class="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl z-10 max-h-[90vh] flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <Layers class="w-5 h-5 text-sky-400" />
          <h3 class="text-base font-bold text-white">天气对比系统与数据源</h3>
        </div>
        <button
          @click="$emit('close')"
          class="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="mt-4 flex-1 overflow-y-auto no-scrollbar space-y-4 text-xs text-slate-300">
        <!-- Providers Status -->
        <div class="space-y-2.5">
          <!-- Caiyun Card -->
          <div class="p-3 rounded-2xl bg-sky-950/30 border border-sky-800/40 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-sky-300 text-sm">彩云天气 (Caiyun)</span>
              <span
                class="px-2 py-0.5 rounded text-[10px] font-medium"
                :class="status?.caiyun?.configured ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'"
              >
                {{ status?.caiyun?.configured ? '已连接官方 API' : '演练模拟引擎' }}
              </span>
            </div>
            <p class="text-slate-400 leading-relaxed text-[11px]">
              特色：公里级网格、两小时短临分钟级雷达降水预测、高精度气压与 AQI。
            </p>
          </div>

          <!-- QWeather Card -->
          <div class="p-3 rounded-2xl bg-amber-950/30 border border-amber-800/40 space-y-1.5">
            <div class="flex items-center justify-between">
              <span class="font-bold text-amber-300 text-sm">和风天气 (QWeather)</span>
              <span
                class="px-2 py-0.5 rounded text-[10px] font-medium"
                :class="status?.qweather?.configured ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'"
              >
                {{ status?.qweather?.configured ? '已连接官方 API' : '演练模拟引擎' }}
              </span>
            </div>
            <p class="text-slate-400 leading-relaxed text-[11px]">
              特色：官方权威气象台源、全球城市覆盖、逐小时细粒度气温预报、多维空气指标。
            </p>
          </div>
        </div>

        <!-- How to configure Real Keys -->
        <div class="p-3.5 rounded-2xl bg-slate-800/50 border border-slate-700/60 space-y-2">
          <div class="flex items-center gap-1.5 text-slate-200 font-semibold">
            <Key class="w-4 h-4 text-amber-400" />
            <span>如何配置真实 API Key？</span>
          </div>
          <p class="text-slate-400 leading-relaxed text-[11px]">
            在项目目录 <code class="px-1 py-0.5 rounded bg-slate-900 text-sky-300 font-mono">backend/.env</code> 中填入您的密钥即可即刻生效：
          </p>
          <div class="bg-slate-950 p-2 rounded-xl font-mono text-[10px] text-slate-300 space-y-1 border border-slate-800">
            <div>CAIYUN_TOKEN=您的彩云天气Token</div>
            <div>QWEATHER_API_KEY=您的和风天气Key</div>
          </div>
          <p class="text-[10px] text-slate-500">
            * 即使不配置 Key，内置高拟真算法也会根据城市坐标与时段自动生成完整的逐时和7天对比数据，便于开箱即测。
          </p>
        </div>

        <!-- Architecture Stack -->
        <div class="p-3 rounded-2xl bg-slate-800/30 border border-slate-800 text-[11px] space-y-1 text-slate-400">
          <div class="text-slate-300 font-medium flex items-center gap-1.5">
            <Cpu class="w-3.5 h-3.5 text-sky-400" />
            <span>技术架构</span>
          </div>
          <div>• 前端：Vite + Vue 3 (Composition API) + Tailwind CSS + ECharts</div>
          <div>• 后端：NestJS + TypeScript + Axios (服务代理/数据统一清洗)</div>
        </div>
      </div>

      <!-- Footer button -->
      <div class="mt-4 pt-3 border-t border-slate-800">
        <button
          @click="$emit('close')"
          class="w-full py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 active:scale-95 text-white font-semibold text-xs transition-all shadow-lg shadow-sky-600/20"
        >
          我知道了
        </button>
      </div>
    </div>
  </div>
</template>
