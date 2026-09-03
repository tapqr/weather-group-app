<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import { fetchTopLocations, searchLocations } from '../api/geo';
import { formatLocationName } from '../utils/location-display';
import type { NormalizedLocation } from '../types/location';

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ select: [location: NormalizedLocation]; close: [] }>();

const SEARCH_DEBOUNCE_MS = 300;

const keyword = ref('');
const results = ref<NormalizedLocation[]>([]);
const topCities = ref<NormalizedLocation[]>([]);
const searching = ref(false);
const searchFailed = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

let debounceTimer: ReturnType<typeof setTimeout> | undefined;
// 自增序号用来丢弃过期响应:先发后到的请求不得覆盖更新的结果
let requestSeq = 0;

async function runSearch(q: string) {
  const seq = ++requestSeq;
  searching.value = true;
  searchFailed.value = false;
  try {
    const locations = await searchLocations(q);
    if (seq !== requestSeq) return;
    results.value = locations;
  } catch {
    if (seq !== requestSeq) return;
    // 只给用户一句可重试的话,HTTP 细节留在控制台/服务端日志里
    searchFailed.value = true;
    results.value = [];
  } finally {
    if (seq === requestSeq) {
      searching.value = false;
    }
  }
}

watch(keyword, (value) => {
  clearTimeout(debounceTimer);
  const trimmed = value.trim();
  if (!trimmed) {
    // 清空输入:取消进行中的请求(靠自增序号让它的结果失效),回到热门城市
    requestSeq += 1;
    results.value = [];
    searching.value = false;
    searchFailed.value = false;
    return;
  }
  searching.value = true;
  debounceTimer = setTimeout(() => void runSearch(trimmed), SEARCH_DEBOUNCE_MS);
});

watch(
  () => props.open,
  async (open) => {
    if (!open) {
      keyword.value = '';
      return;
    }
    await nextTick();
    inputEl.value?.focus();
    if (topCities.value.length === 0) {
      // fetchTopLocations 失败时返回空数组,模板会退回提示文案
      topCities.value = await fetchTopLocations();
    }
  },
  { immediate: true },
);

function selectLocation(location: NormalizedLocation) {
  emit('select', location);
  keyword.value = '';
}
</script>

<template>
  <div v-if="open" class="city-search" role="dialog" aria-label="搜索城市">
    <div class="city-search__bar">
      <input
        ref="inputEl"
        v-model="keyword"
        type="search"
        placeholder="搜索城市"
        aria-label="搜索城市"
        autocomplete="off"
      />
      <button type="button" class="city-search__cancel" @click="emit('close')">取消</button>
    </div>

    <!-- 有输入:结果 / 加载中 / 失败 -->
    <template v-if="keyword.trim()">
      <ul v-if="results.length > 0" class="city-search__results">
        <li v-for="item in results" :key="item.id">
          <button type="button" @click="selectLocation(item)">
            <span class="city-search__name">{{ formatLocationName(item) }}</span>
            <span class="city-search__adm">{{ item.adm1 }}</span>
          </button>
        </li>
      </ul>
      <p v-else-if="searching" class="city-search__hint">搜索中…</p>
      <p v-else-if="searchFailed" class="city-search__hint">搜索失败,请稍后重试</p>
      <p v-else class="city-search__hint">没有找到「{{ keyword.trim() }}」</p>
    </template>

    <!-- 无输入:热门城市,拿不到就退回提示文案 -->
    <template v-else>
      <ul v-if="topCities.length > 0" class="city-search__results">
        <li v-for="item in topCities" :key="item.id">
          <button type="button" @click="selectLocation(item)">
            <span class="city-search__name">{{ formatLocationName(item) }}</span>
            <span class="city-search__adm">{{ item.adm1 }}</span>
          </button>
        </li>
      </ul>
      <p v-else class="city-search__hint">输入城市名开始搜索</p>
    </template>
  </div>
</template>

<style scoped>
.city-search {
  position: fixed;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  padding: 12px var(--page-pad) 0;
  background: linear-gradient(170deg, var(--sky-from), var(--sky-via) 55%, var(--sky-to));
  animation: search-in 220ms ease;
}

@keyframes search-in {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
}

.city-search__bar {
  display: flex;
  align-items: center;
  gap: 10px;
  /* 顶部留出刘海屏安全区 */
  padding-top: env(safe-area-inset-top, 0);
}

.city-search__bar input {
  flex: 1;
  min-height: 44px;
  padding: 0 14px;
  font-size: 16px; /* 小于 16px 时 iOS Safari 会自动放大页面 */
  font-family: inherit;
  color: var(--ink);
  background: var(--card-veil);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-chip);
  outline: none;
}

.city-search__bar input::placeholder {
  color: var(--ink-faint);
}

.city-search__cancel {
  min-height: 44px;
  padding: 0 4px;
  font-size: 15px;
  color: var(--ink-dim);
}

.city-search__results {
  margin-top: 14px;
  overflow-y: auto;
  border-radius: var(--radius-card);
  border: 1px solid var(--card-border);
  background: var(--card-veil);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.city-search__results li + li {
  border-top: 1px solid var(--card-veil);
}

.city-search__results button {
  width: 100%;
  min-height: 48px;
  padding: 8px 16px;
  text-align: left;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.city-search__name {
  font-size: 16px;
}

/* 省级名用来区分同名地点(辽宁的朝阳 vs 北京的朝阳) */
.city-search__adm {
  font-size: 12px;
  color: var(--ink-faint);
  white-space: nowrap;
}

.city-search__hint {
  margin-top: 22px;
  text-align: center;
  font-size: 14px;
  color: var(--ink-faint);
}
</style>
