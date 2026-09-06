<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { weatherApi } from './services/api';
import { WeatherComparisonResponse, CityInfo } from './types/weather';
import HeaderNav from './components/HeaderNav.vue';
import ComparisonSummaryCard from './components/ComparisonSummaryCard.vue';
import RealtimeCompareCard from './components/RealtimeCompareCard.vue';
import MinutelyRainRadar from './components/MinutelyRainRadar.vue';
import HourlyCompareChart from './components/HourlyCompareChart.vue';
import DailyForecastCompare from './components/DailyForecastCompare.vue';
import CitySelectModal from './components/CitySelectModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import { AlertCircle, RefreshCw, Layers } from 'lucide-vue-next';

const currentCity = ref('北京');
const weatherData = ref<WeatherComparisonResponse | null>(null);
const loading = ref(false);
const errorMsg = ref('');

const showCityModal = ref(false);
const showSettingsModal = ref(false);

const loadWeatherData = async (cityName?: string, lat?: number, lng?: number) => {
  loading.value = true;
  errorMsg.value = '';
  try {
    const data = await weatherApi.getComparison(cityName || currentCity.value, lat, lng);
    weatherData.value = data;
    currentCity.value = data.location.city;
  } catch (err: any) {
    console.error(err);
    errorMsg.value = '获取天气数据失败，请确保后端服务 (http://localhost:3000) 已启动。';
  } finally {
    loading.value = false;
  }
};

const handleSelectCity = (city: CityInfo) => {
  currentCity.value = city.name;
  loadWeatherData(city.name, city.lat, city.lng);
};

const handleLocate = (silent = false) => {
  if (navigator.geolocation) {
    loading.value = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        loadWeatherData(undefined, pos.coords.latitude, pos.coords.longitude);
        showCityModal.value = false;
      },
      (err) => {
        console.warn('Geolocation error or permission denied:', err.message);
        loading.value = false;
        if (!silent) {
          alert('未能获取定位权限或超时，已为您保留当前城市');
        }
        if (silent && !weatherData.value) {
          loadWeatherData('北京');
        }
      },
      { timeout: 6000, enableHighAccuracy: true }
    );
  } else {
    if (!silent) {
      alert('当前浏览器环境不支持地理位置获取');
    }
    if (!weatherData.value) {
      loadWeatherData('北京');
    }
  }
};

onMounted(() => {
  handleLocate(true);
});
</script>

<template>
  <div class="min-h-screen bg-slate-950 flex flex-col items-center justify-start antialiased text-slate-100 selection:bg-sky-500">
    <!-- Mobile Screen Frame Container (H5 Viewport) -->
    <div class="w-full max-w-md min-h-screen flex flex-col bg-slate-900 border-x border-slate-800/80 shadow-2xl relative pb-10">
      <!-- Top Navigation Bar -->
      <HeaderNav
        :city="currentCity"
        :loading="loading"
        :caiyunConfigured="weatherData?.meta?.caiyunConfigured ?? false"
        :qweatherConfigured="weatherData?.meta?.qweatherConfigured ?? false"
        @selectCity="showCityModal = true"
        @refresh="loadWeatherData()"
        @openSettings="showSettingsModal = true"
      />

      <!-- Main Scrollable Content -->
      <main class="flex-1 p-3.5 space-y-3.5">
        <!-- Error Alert -->
        <div
          v-if="errorMsg"
          class="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between"
        >
          <div class="flex items-center gap-2">
            <AlertCircle class="w-4 h-4 shrink-0 text-rose-400" />
            <span>{{ errorMsg }}</span>
          </div>
          <button
            @click="loadWeatherData()"
            class="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-white font-medium shrink-0"
          >
            重试
          </button>
        </div>

        <!-- Loading State Skeleton -->
        <div v-if="loading && !weatherData" class="py-20 text-center space-y-3">
          <RefreshCw class="w-8 h-8 text-sky-400 animate-spin mx-auto" />
          <div class="text-sm text-slate-400">正在同时拉取彩云天气与和风天气预报...</div>
        </div>

        <!-- Loaded Data Display -->
        <template v-if="weatherData">
          <!-- 1. Comparison AI Summary Verdict Card -->
          <ComparisonSummaryCard
            :analysis="weatherData.analysis"
            :tempDiff="weatherData.realtime.tempDiff"
            :feelsLikeDiff="weatherData.realtime.feelsLikeDiff"
          />

          <!-- 2. Realtime Side-by-Side Weather Card -->
          <RealtimeCompareCard
            :caiyun="weatherData.realtime.caiyun"
            :qweather="weatherData.realtime.qweather"
            :tempDiff="weatherData.realtime.tempDiff"
            :feelsLikeDiff="weatherData.realtime.feelsLikeDiff"
          />

          <!-- 3. Caiyun Minutely Rain Radar vs QWeather Summary -->
          <MinutelyRainRadar
            :caiyunRain="weatherData.minutelyRain.caiyun"
            :qweatherSummary="weatherData.minutelyRain.qweatherSummary"
          />

          <!-- 4. 24-Hour Dual-Curve Forecast Comparison -->
          <HourlyCompareChart :hourly="weatherData.hourly" />

          <!-- 5. 7-Day Trend Comparison -->
          <DailyForecastCompare :daily="weatherData.daily" />
        </template>
      </main>

      <!-- Footer Info -->
      <footer class="mt-4 px-4 text-center text-[11px] text-slate-500 space-y-1">
        <div class="flex items-center justify-center gap-1.5 text-slate-400">
          <Layers class="w-3.5 h-3.5 text-sky-400" />
          <span>彩云天气 (Caiyun) × 和风天气 (QWeather) 双源对比</span>
        </div>
        <div>Vite + Vue 3 · NestJS Backend · 移动端 H5 体验</div>
      </footer>

      <!-- City Selector Modal -->
      <CitySelectModal
        :show="showCityModal"
        @close="showCityModal = false"
        @select="handleSelectCity"
        @locate="handleLocate"
      />

      <!-- Settings / Status Modal -->
      <SettingsModal
        :show="showSettingsModal"
        @close="showSettingsModal = false"
      />
    </div>
  </div>
</template>
