<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { weatherApi } from '../services/api';
import { CityInfo } from '../types/weather';
import { Search, MapPin, X, Navigation } from 'lucide-vue-next';

defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'select', city: CityInfo): void;
  (e: 'locate'): void;
}>();

const query = ref('');
const popularCities = ref<CityInfo[]>([]);
const searchResults = ref<CityInfo[]>([]);
const isSearching = ref(false);

const loadPopularCities = async () => {
  try {
    const list = await weatherApi.getCities();
    popularCities.value = list;
  } catch (err) {
    console.error(err);
  }
};

let searchTimer: any = null;
const handleInput = () => {
  clearTimeout(searchTimer);
  if (!query.value.trim()) {
    searchResults.value = [];
    isSearching.value = false;
    return;
  }
  isSearching.value = true;
  searchTimer = setTimeout(async () => {
    try {
      searchResults.value = await weatherApi.getCities(query.value.trim());
    } catch (e) {
      console.error(e);
    } finally {
      isSearching.value = false;
    }
  }, 300);
};

const chooseCity = (city: CityInfo) => {
  emit('select', city);
  emit('close');
};

onMounted(() => {
  loadPopularCities();
});
</script>

<template>
  <div v-if="show" class="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
    <!-- Backdrop -->
    <div
      @click="$emit('close')"
      class="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
    ></div>

    <!-- Sheet Panel -->
    <div
      class="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl z-10 max-h-[85vh] flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <MapPin class="w-5 h-5 text-sky-400" />
          <h3 class="text-base font-bold text-white">选择目标城市</h3>
        </div>
        <button
          @click="$emit('close')"
          class="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X class="w-5 h-5" />
        </button>
      </div>

      <!-- Search Box & Locate button -->
      <div class="mt-4 flex gap-2">
        <div class="relative flex-1">
          <Search class="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            v-model="query"
            @input="handleInput"
            placeholder="输入城市拼音或汉字 (如 杭州, 成都)..."
            class="w-full bg-slate-800/90 text-sm text-slate-100 placeholder-slate-500 rounded-xl pl-9 pr-4 py-2.5 outline-none border border-slate-700 focus:border-sky-500 transition-colors"
          />
        </div>
        <button
          @click="$emit('locate')"
          title="定位当前位置"
          class="px-3 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 text-sky-300 border border-sky-500/30 flex items-center gap-1 text-xs font-medium shrink-0 active:scale-95 transition-all"
        >
          <Navigation class="w-4 h-4" />
          <span>定位</span>
        </button>
      </div>

      <!-- Content Area -->
      <div class="mt-4 flex-1 overflow-y-auto no-scrollbar space-y-4">
        <!-- Search Results -->
        <div v-if="query.trim()">
          <div class="text-xs font-medium text-slate-400 mb-2">搜索结果</div>
          <div v-if="searchResults.length === 0" class="text-xs text-slate-500 py-4 text-center">
            {{ isSearching ? '正在搜索...' : '未找到匹配城市' }}
          </div>
          <div class="space-y-1.5" v-else>
            <div
              v-for="item in searchResults"
              :key="item.name + (item.province || '')"
              @click="chooseCity(item)"
              class="p-2.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 flex items-center justify-between cursor-pointer active:scale-[0.99] transition-all"
            >
              <span class="text-sm font-medium text-slate-200">{{ item.name }}</span>
              <span class="text-xs text-slate-400">{{ item.province || '' }}</span>
            </div>
          </div>
        </div>

        <!-- Popular Cities -->
        <div v-else>
          <div class="text-xs font-medium text-slate-400 mb-2.5">热门推荐城市</div>
          <div class="grid grid-cols-4 gap-2">
            <button
              v-for="item in popularCities"
              :key="item.id || item.name + (item.province || '')"
              @click="chooseCity(item)"
              class="py-2 px-1 rounded-xl bg-slate-800/70 hover:bg-sky-950/40 hover:border-sky-600/40 border border-slate-700/50 text-xs font-medium text-slate-200 text-center active:scale-95 transition-all truncate"
              :title="item.province ? `${item.province} · ${item.name}` : item.name"
            >
              {{ item.name }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
