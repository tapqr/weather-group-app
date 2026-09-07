<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useWeatherStore } from './stores/weather';
import { requestCurrentLocation } from './composables/useGeolocation';
import CitySearch from './components/CitySearch.vue';
import ProviderCard from './components/ProviderCard.vue';
import ConsensusCard from './components/ConsensusCard.vue';
import HourlyTrendChart from './components/HourlyTrendChart.vue';
import WeatherIcon from './components/WeatherIcon.vue';
import type { NormalizedLocation } from './types/location';
import { fetchReverseLocation } from './api/geo';
import { formatLocationName } from './utils/location-display';
import { classifyCondition, formatTemperature, resolveDayPart, type DayPart } from './utils/weather-display';
import { alignDaily, alignHourly, buildConsensus, type OkProvider } from './utils/consensus';

const PROVIDER_LABELS: Record<string, string> = {
  qweather: '和风天气',
  caiyun: '彩云天气',
  seniverse: '心知天气',
};

const store = useWeatherStore();
const locationDenied = ref(false);
const searchOpen = ref(false);
// 图标需要知道昼夜(晴天画太阳还是月亮),所以除了写进 DOM 还留一份在这里
const daypart = ref<DayPart>(resolveDayPart(new Date()));

// 昼夜基调写在根元素上,style.css 里的 :root[data-daypart] 据此换整套配色
const THEME_COLORS: Record<string, string> = {
  day: '#d3e9fa',
  twilight: '#f7d3b6',
  night: '#37477e',
};

function applyDayPart() {
  const part = resolveDayPart(new Date());
  daypart.value = part;
  document.documentElement.dataset.daypart = part;
  // 让移动端浏览器的地址栏/状态栏跟着一起变,这是"像原生应用"很关键的一环
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[part]);
}

const headline = computed(() =>
  store.providers.map((slot) => ({
    provider: slot.provider,
    label: PROVIDER_LABELS[slot.provider] ?? slot.provider,
    ok: slot.status === 'ok' && slot.data?.current != null,
    temp: slot.data?.current ? formatTemperature(slot.data.current.tempC) : null,
    text: slot.data?.current?.conditionText ?? null,
    // 失败态与未知天气共用中性图标,和卡片配色的处理保持一致
    condition: classifyCondition(slot.data?.current?.conditionText ?? ''),
  })),
);

/*
 * 跨数据源的派生数据都从这一份 okProviders 出发。
 *
 * 只取 status==='ok' 且真的有 data 的那些 —— 失败的数据源不参与对齐和分歧判定
 * (拿一家的数据跟"没有数据"比较没有意义),但它在页面上仍然占一张卡片的位置,
 * 因为"这里本该有一家的数据"本身就是信息。
 */
const okProviders = computed<OkProvider[]>(() =>
  store.providers
    .filter((slot) => slot.status === 'ok' && slot.data !== null)
    .map((slot) => ({
      provider: slot.provider,
      label: PROVIDER_LABELS[slot.provider] ?? slot.provider,
      data: slot.data!,
    })),
);

// 按时间戳对齐,不按下标 —— 实测两家的逐时起始时刻能差一小时(见 consensus.ts)
const alignedHourly = computed(() => alignHourly(okProviders.value));

// 每天的一致性评级传给两张卡片,由它们在逐日行上标出来。
// 单张卡片自己算不出这个值:它是跨数据源的属性
const dailyAgreements = computed(() =>
  Object.fromEntries(alignDaily(okProviders.value).map((row) => [row.date, row.agreement])),
);

// 少于两家有实况时返回 null,卡片整个不渲染 —— 一家数据谈不上"共识"
const consensus = computed(() => buildConsensus(okProviders.value, alignedHourly.value));

// 自增"选择世代"号,统一仲裁两条独立写 cityName/天气的路径(手选 city vs 定位反查):
// 谁的世代号在写入时仍是当前值,谁才能真正落地。避免晚到的反查结果覆盖用户手选的城市。
let selectionSeq = 0;

async function selectCity(location: NormalizedLocation) {
  ++selectionSeq;
  searchOpen.value = false;
  locationDenied.value = false;
  await store.loadWeather(location.lat, location.lon, formatLocationName(location));
}

onMounted(async () => {
  const seq = ++selectionSeq;
  applyDayPart();
  let coords;
  try {
    coords = await requestCurrentLocation();
  } catch {
    locationDenied.value = true;
    // 定位失败时直接把搜索层推到用户面前,不用他自己找入口
    searchOpen.value = true;
    return;
  }

  if (seq !== selectionSeq) return; // 定位回来时用户已经手选过了,放弃这条路径

  // 天气和地名并行发出:地名到得晚,不能让它拖慢天气渲染。
  // 反查失败时 fetchReverseLocation 返回 null,标题保持"当前位置"
  store.loadWeather(coords.lat, coords.lon, '当前位置');
  const location = await fetchReverseLocation(coords.lat, coords.lon);
  if (location && seq === selectionSeq) {
    store.setCityName(formatLocationName(location));
  }
});
</script>

<template>
  <main class="app">
    <header class="app__top">
      <h1>{{ store.cityName ?? '天气对比' }}</h1>
      <button type="button" class="app__search-btn" aria-label="搜索城市" @click="searchOpen = true">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" stroke-width="2" />
          <path d="M16 16l4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
      </button>
    </header>

    <p v-if="locationDenied" class="app__hint">未获取到定位,请手动搜索城市查看天气</p>

    <p v-if="store.status === 'loading'" class="app__status">加载中…</p>
    <p v-else-if="store.status === 'error'" class="app__status">{{ store.errorMessage }}</p>

    <template v-else-if="store.status === 'loaded'">
      <!-- 顶部对比区:两家实况并列,一眼看出温差。这是这个产品存在的理由 -->
      <section class="headline">
        <div v-for="item in headline" :key="item.provider" class="headline__item">
          <span class="headline__label">{{ item.label }}</span>
          <template v-if="item.ok">
            <strong class="headline__temp">{{ item.temp }}°</strong>
            <span class="headline__text">
              <WeatherIcon :condition="item.condition" :daypart="daypart" :size="16" />
              {{ item.text }}
            </span>
          </template>
          <template v-else>
            <strong class="headline__temp headline__temp--muted">—</strong>
            <span class="headline__text">暂无数据</span>
          </template>
        </div>
      </section>

      <!-- 分歧摘要放在最上面:用户扫一眼就知道两家在哪儿不一致,再往下看细节 -->
      <ConsensusCard v-if="consensus" :consensus="consensus" />

      <!-- 逐时曲线是跨数据源的,所以独立成块;卡片里那份逐时列表保留(它带天气文案) -->
      <HourlyTrendChart :hourly="alignedHourly" />

      <div class="app__cards">
        <ProviderCard
          v-for="slot in store.providers"
          :key="slot.provider"
          :slot="slot"
          :agreements="dailyAgreements"
        />
      </div>
    </template>

    <CitySearch :open="searchOpen" @select="selectCity" @close="searchOpen = false" />
  </main>
</template>

<style scoped>
.app {
  min-height: 100svh;
  padding: 0 var(--page-pad) 32px;
  padding-top: calc(env(safe-area-inset-top, 0px) + 14px);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.app__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.app__top h1 {
  font-size: 26px;
  font-weight: 600;
  letter-spacing: 0.5px;
}

.app__search-btn {
  flex: none;
  width: 44px;
  height: 44px;
  margin-right: -10px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--ink-dim);
  transition: background 200ms ease;
}

.app__search-btn:active {
  background: var(--card-veil);
}

.app__hint,
.app__status {
  font-size: 14px;
  color: var(--ink-dim);
}

/* 两家并列。列数跟着数据源个数走,加第三家不用改样式 */
.headline {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 10px;
  padding: 6px 0 2px;
}

.headline__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  text-align: center;
}

.headline__label {
  font-size: 12px;
  color: var(--ink-dim);
  letter-spacing: 0.4px;
}

.headline__temp {
  font-size: 62px;
  font-weight: 200;
  line-height: 1.05;
  letter-spacing: -2px;
  font-variant-numeric: tabular-nums;
}

.headline__temp--muted {
  color: var(--ink-faint);
}

.headline__text {
  font-size: 14px;
  color: var(--ink-dim);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.app__cards {
  display: flex;
  flex-direction: column;
  gap: var(--gap);
}
</style>
