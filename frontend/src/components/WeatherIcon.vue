<script setup lang="ts">
import { computed } from 'vue';
import type { ConditionCategory, DayPart } from '../utils/weather-display';

/*
 * 天气图标。
 *
 * 刻意不做"上游天气码 → 图标"的映射表:那需要维护两张表(和风的 condition.code、
 * 彩云的 skycon),而现成的 classifyCondition() 注释里就写着它"驱动卡片配色与图标" ——
 * 这个分类器本来就是为图标预留的,只是图标一直没做。复用它,新增数据源时
 * 图标自动跟着走,不用再补一张映射表。
 *
 * 晴天要分日月:彩云的 CLEAR_DAY / CLEAR_NIGHT 在后端归一化时都被压成了「晴」,
 * 昼夜信息在那一步就丢了。所以太阳还是月亮由调用方传 daypart 决定 ——
 * 反正昼夜是客观事实,本地时钟比任何 API 都直接(见 resolveDayPart 的注释)。
 */
const props = withDefaults(
  defineProps<{
    condition: ConditionCategory;
    /** 只对 clear 有意义:决定画太阳还是月亮。不传则一律画太阳 */
    daypart?: DayPart;
    size?: number;
  }>(),
  { daypart: 'day', size: 24 },
);

const isNight = computed(() => props.daypart === 'night');
</script>

<template>
  <svg
    class="weather-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.6"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <!-- 晴:夜间画月牙,白天画太阳 -->
    <template v-if="condition === 'clear'">
      <path v-if="isNight" d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5z" />
      <template v-else>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6" />
      </template>
    </template>

    <!-- 多云/阴 -->
    <path v-else-if="condition === 'cloudy'" d="M7 18h10a3.6 3.6 0 0 0 .3-7.2A5.4 5.4 0 0 0 6.8 11 3.5 3.5 0 0 0 7 18z" />

    <!-- 雨:云 + 三道雨线 -->
    <template v-else-if="condition === 'rain'">
      <path d="M7 14.5h10a3.4 3.4 0 0 0 .3-6.8A5.2 5.2 0 0 0 6.8 8 3.4 3.4 0 0 0 7 14.5z" />
      <path d="M9 17.4l-.8 2.4M12 17.4l-.8 2.4M15 17.4l-.8 2.4" />
    </template>

    <!-- 雪:云 + 雪粒 -->
    <template v-else-if="condition === 'snow'">
      <path d="M7 14.5h10a3.4 3.4 0 0 0 .3-6.8A5.2 5.2 0 0 0 6.8 8 3.4 3.4 0 0 0 7 14.5z" />
      <path d="M9 18.6h.01M12 20.2h.01M15 18.6h.01" stroke-width="2.2" />
    </template>

    <!-- 雾/霾/沙尘:横向层积 -->
    <path v-else-if="condition === 'haze'" d="M4 9h16M6 13h12M4 17h16" />

    <!-- 大风:两道气流 -->
    <path v-else-if="condition === 'wind'" d="M3 9h11a3 3 0 1 0-3-3M3 15h8a2.6 2.6 0 1 1-2.6 2.6" />

    <!-- 未知天气与失败态共用:虚线圆,明确表达"这里本该有个图标" -->
    <circle v-else cx="12" cy="12" r="8" stroke-dasharray="3 3" />
  </svg>
</template>

<style scoped>
.weather-icon {
  flex: none;
  /* 图标跟随文字颜色,昼夜主题切换时自动跟着变(CSS 变量驱动,不需要 JS 同步) */
  color: inherit;
  opacity: 0.85;
}
</style>
