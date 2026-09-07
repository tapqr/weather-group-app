<script setup lang="ts">
import { computed } from 'vue';
import type { ProviderSlot } from '../stores/weather';
import type { AgreementLevel } from '../utils/consensus';
import {
  classifyCondition,
  formatPrecip,
  formatPressure,
  formatTemperature,
  formatVisibility,
  formatWindDirection,
  formatWindScale,
  formatWindSpeed,
  resolveDayPart,
} from '../utils/weather-display';
import WeatherIcon from './WeatherIcon.vue';

const props = withDefaults(
  defineProps<{
    slot: ProviderSlot;
    /**
     * 每天的跨数据源一致性,按日期索引。由 App 算好传进来 ——
     * 它是"这一天各家分歧有多大"的属性,单张卡片自己算不出来。
     * 不传(比如只有一家有数据)时逐日行不带任何标记。
     */
    agreements?: Record<string, AgreementLevel | null>;
  }>(),
  { agreements: () => ({}) },
);

// 昼夜只影响晴天图标画太阳还是月亮。彩云的 CLEAR_DAY/CLEAR_NIGHT 在后端归一化时
// 已被压成「晴」,昼夜信息那一步就丢了,所以这里用本地时钟判断(见 resolveDayPart)
const daypart = resolveDayPart(new Date());

const PROVIDER_LABELS: Record<string, string> = {
  qweather: '和风天气',
  caiyun: '彩云天气',
  seniverse: '心知天气',
};

const providerLabel = computed(() => PROVIDER_LABELS[props.slot.provider] ?? props.slot.provider);

// 失败的卡片保持完整尺寸、走中性灰 —— 位置本身就是信息:用户能看出"这里本该有一家的数据",
// 而不是以为这个应用只展示一个数据源
const condition = computed(() =>
  props.slot.status === 'error' || !props.slot.data?.current
    ? 'unknown'
    : classifyCondition(props.slot.data.current.conditionText),
);

// 从 ISO 时间字符串(如 "2026-09-02T15:00+08:00")里取出 "HH:mm",不用 Date 解析,
// 避免时区换算把上游给的当地预报时间挪走
function formatHour(isoTime: string): string {
  const match = isoTime.match(/T(\d{2}):(\d{2})/);
  return match ? `${match[1]}时` : isoTime;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function formatDay(date: string, index: number): string {
  if (index === 0) return '今天';
  if (index === 1) return '明天';
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? date : WEEKDAYS[parsed.getDay()];
}

// 直接取字符串里的 MM/DD,不走 Date —— 上游给的就是当地日期,时区换算只会把它挪走
function formatDate(date: string): string {
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return match ? `${match[1]}/${match[2]}` : date;
}

// 逐日温度条:把所有天的最低~最高映射到同一根标尺上,长短和位置才有可比性
const dailyRange = computed(() => {
  const days = props.slot.data?.daily ?? [];
  if (days.length === 0) return null;
  const min = Math.min(...days.map((d) => d.tempMinC));
  const max = Math.max(...days.map((d) => d.tempMaxC));
  return { min, max, span: max - min || 1 };
});

function barStyle(tempMinC: number, tempMaxC: number) {
  const range = dailyRange.value;
  if (!range) return {};
  return {
    marginLeft: `${((tempMinC - range.min) / range.span) * 100}%`,
    width: `${Math.max(((tempMaxC - tempMinC) / range.span) * 100, 6)}%`,
  };
}
</script>

<template>
  <section class="provider-card" :data-condition="condition">
    <header class="provider-card__head">
      <WeatherIcon :condition="condition" :daypart="daypart" :size="20" />
      <h3>{{ providerLabel }}</h3>
      <span v-if="slot.status === 'ok' && slot.data?.daily.length" class="provider-card__span">
        {{ slot.data.daily.length }} 天预报
      </span>
    </header>

    <p v-if="slot.status === 'error'" class="provider-card__error">
      <span class="provider-card__error-mark" aria-hidden="true">!</span>
      {{ slot.errorMessage ?? '数据源暂时不可用' }},请稍后重试
    </p>

    <template v-else-if="slot.data">
      <p v-if="!slot.data.current" class="provider-card__empty">暂无实时数据</p>
      <dl v-else class="provider-card__metrics">
        <div>
          <dt>体感</dt>
          <dd>{{ formatTemperature(slot.data.current.feelsLikeC) }}°</dd>
        </div>
        <div>
          <dt>湿度</dt>
          <dd>{{ slot.data.current.humidityPercent === null ? '—' : slot.data.current.humidityPercent + '%' }}</dd>
        </div>
        <div>
          <dt>风速</dt>
          <dd>{{ formatWindSpeed(slot.data.current.windSpeedKph) }}<small>km/h</small></dd>
        </div>
        <div>
          <dt>风向风力</dt>
          <dd>{{ formatWindDirection(slot.data.current.windDirectionDeg) }} {{ formatWindScale(slot.data.current.windScale) }}<small>级</small></dd>
        </div>
        <div>
          <dt>空气质量</dt>
          <dd>
            {{ slot.data.current.airQuality?.aqi ?? '—' }}
            <small v-if="slot.data.current.airQuality?.category">{{ slot.data.current.airQuality.category }}</small>
          </dd>
        </div>
        <div>
          <dt>PM2.5</dt>
          <dd>{{ slot.data.current.airQuality?.pm25 ?? '—' }}<small>μg/m³</small></dd>
        </div>
        <div>
          <dt>气压</dt>
          <dd>{{ formatPressure(slot.data.current.pressureHpa) }}<small>hPa</small></dd>
        </div>
        <div>
          <dt>能见度</dt>
          <dd>{{ formatVisibility(slot.data.current.visibilityKm) }}<small>km</small></dd>
        </div>
        <div>
          <dt>降水</dt>
          <dd>{{ formatPrecip(slot.data.current.precipMm) }}<small>mm</small></dd>
        </div>
      </dl>

      <ul v-if="slot.data.hourly.length > 0" class="provider-card__hourly">
        <li v-for="hour in slot.data.hourly" :key="hour.time">
          <span class="hour-time">{{ formatHour(hour.time) }}</span>
          <WeatherIcon :condition="classifyCondition(hour.conditionText)" :daypart="daypart" :size="18" />
          <span class="hour-temp">{{ formatTemperature(hour.tempC) }}°</span>
          <span class="hour-text">{{ hour.conditionText }}</span>
        </li>
      </ul>

      <ul v-if="slot.data.daily.length > 0" class="provider-card__daily">
        <li
          v-for="(day, index) in slot.data.daily"
          :key="day.date"
          :data-agreement="agreements[day.date] ?? 'none'"
        >
          <span class="day-name">{{ formatDay(day.date, index) }}</span>
          <span class="day-date">{{ formatDate(day.date) }}</span>
          <span class="day-text">
            {{ day.conditionText }}<template v-if="day.nightConditionText">
              <span class="day-night">/{{ day.nightConditionText }}</span>
            </template>
          </span>
          <span class="day-low">{{ formatTemperature(day.tempMinC) }}°</span>
          <span class="day-track">
            <span class="day-bar" :style="barStyle(day.tempMinC, day.tempMaxC)"></span>
          </span>
          <span class="day-high">{{ formatTemperature(day.tempMaxC) }}°</span>
        </li>
      </ul>
    </template>
  </section>
</template>

<style scoped>
/* 每家卡片带自己的天气色调 —— 两家报的天气不一样时,两张卡片颜色不同就能看出来,
   这正是这个产品要展示的东西。
   色值都是压暗方向的半透明,叠在浅背景上让卡片沉下去(背景始终比卡片浅) */
.provider-card {
  --tint-from: rgba(13, 36, 54, 0.08);
  --tint-to: rgba(13, 36, 54, 0.04);

  border-radius: var(--radius-card);
  border: 1px solid var(--card-border);
  background: linear-gradient(150deg, var(--tint-from), var(--tint-to));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  transition: background 500ms ease;
}

.provider-card[data-condition='clear'] {
  --tint-from: rgba(232, 152, 40, 0.2);
  --tint-to: rgba(58, 130, 200, 0.16);
}
.provider-card[data-condition='cloudy'] {
  --tint-from: rgba(96, 116, 142, 0.2);
  --tint-to: rgba(64, 82, 106, 0.16);
}
.provider-card[data-condition='rain'] {
  --tint-from: rgba(40, 92, 148, 0.26);
  --tint-to: rgba(24, 58, 100, 0.2);
}
.provider-card[data-condition='snow'] {
  --tint-from: rgba(110, 150, 196, 0.22);
  --tint-to: rgba(76, 112, 156, 0.17);
}
.provider-card[data-condition='haze'] {
  --tint-from: rgba(132, 112, 76, 0.22);
  --tint-to: rgba(96, 82, 58, 0.17);
}
.provider-card[data-condition='wind'] {
  --tint-from: rgba(48, 122, 116, 0.22);
  --tint-to: rgba(32, 88, 86, 0.16);
}
/* 失败态与未知天气共用中性灰 */
.provider-card[data-condition='unknown'] {
  --tint-from: rgba(90, 96, 108, 0.14);
  --tint-to: rgba(70, 76, 88, 0.1);
}

/*
 * 夜间需要另一套色值:上面那些是给浅背景准备的,叠到暗夜空上方向会反过来 —— 彩色
 * 半透明层在暗底上是提亮的,卡片反而会浮到背景之上。这里改用同色相的暗色,
 * 保住"背景比卡片浅"的关系,同时让两家天气不同时仍有可辨的色相差异。
 */
:root[data-daypart='night'] .provider-card[data-condition='clear'] {
  --tint-from: rgba(34, 26, 62, 0.5);
  --tint-to: rgba(24, 20, 48, 0.42);
}
:root[data-daypart='night'] .provider-card[data-condition='cloudy'] {
  --tint-from: rgba(26, 32, 48, 0.52);
  --tint-to: rgba(18, 24, 38, 0.44);
}
:root[data-daypart='night'] .provider-card[data-condition='rain'] {
  --tint-from: rgba(12, 28, 54, 0.58);
  --tint-to: rgba(8, 20, 42, 0.5);
}
:root[data-daypart='night'] .provider-card[data-condition='snow'] {
  --tint-from: rgba(34, 46, 74, 0.46);
  --tint-to: rgba(24, 34, 58, 0.4);
}
:root[data-daypart='night'] .provider-card[data-condition='haze'] {
  --tint-from: rgba(42, 34, 22, 0.52);
  --tint-to: rgba(30, 24, 16, 0.44);
}
:root[data-daypart='night'] .provider-card[data-condition='wind'] {
  --tint-from: rgba(14, 40, 40, 0.5);
  --tint-to: rgba(10, 28, 30, 0.42);
}
:root[data-daypart='night'] .provider-card[data-condition='unknown'] {
  --tint-from: rgba(20, 22, 30, 0.4);
  --tint-to: rgba(14, 16, 24, 0.32);
}

.provider-card__head {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 天数说明推到最右 */
.provider-card__head h3 {
  margin-right: auto;
}

.provider-card__head h3 {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 0.3px;
}

.provider-card__span {
  font-size: 12px;
  color: var(--ink-faint);
}

.provider-card__error {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 96px;
  font-size: 14px;
  color: var(--ink-dim);
}

.provider-card__error-mark {
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1.5px solid var(--ink-faint);
  display: grid;
  place-items: center;
  font-size: 15px;
  font-weight: 600;
}

.provider-card__empty {
  font-size: 14px;
  color: var(--ink-dim);
}

/*
 * 指标从 3 项涨到 9 项,原来的横向 flex 会挤成一坨。
 * 用 auto-fit 网格:窄屏 3 列、宽屏 4 列自动切换,加指标不用改列数。
 */
.provider-card__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(84px, 1fr));
  gap: 12px 10px;
  margin: 0;
}

.provider-card__metrics div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.provider-card__metrics dt {
  font-size: 11px;
  color: var(--ink-faint);
  white-space: nowrap;
}

.provider-card__metrics dd {
  margin: 0;
  font-size: 15px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 单位和类别用小字弱化,让数值本身成为视觉主体 */
.provider-card__metrics dd small {
  font-size: 10px;
  color: var(--ink-faint);
  margin-left: 2px;
  font-weight: 400;
}

/* 逐时:横向滚动,24 条全给,不截断 */
.provider-card__hourly {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  margin: 0 -16px;
  padding: 0 16px 4px;
  scrollbar-width: none;
}

.provider-card__hourly::-webkit-scrollbar {
  display: none;
}

.provider-card__hourly li {
  flex: none;
  scroll-snap-align: start;
  width: 58px;
  padding: 8px 4px 7px;
  border-radius: var(--radius-chip);
  background: var(--card-veil);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.hour-time {
  font-size: 11px;
  color: var(--ink-dim);
  font-variant-numeric: tabular-nums;
}

.hour-temp {
  font-size: 17px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.hour-text {
  font-size: 10px;
  color: var(--ink-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

/* 逐日:两家天数不同(和风 7 天、彩云 3 天),各自按自己的长度渲染 */
.provider-card__daily li {
  display: grid;
  grid-template-columns: 42px 44px 1fr 34px 72px 34px;
  align-items: center;
  gap: 8px;
  padding: 7px 0 7px 7px;
  font-size: 13px;
  border-top: 1px solid var(--card-veil);
  /* 一致性色条的位置。默认透明 —— "没有标记"就是"两家一致",视觉噪音最小 */
  border-left: 2px solid transparent;
  margin-left: -9px;
}

/*
 * 跨数据源的一致性用整行左侧色条表达,而不是新增一列文字标签:
 * 这一行已经是六列网格,375px 屏上再加一列会挤爆天气文案。
 *
 * data-agreement="none" 表示这一天只有一家覆盖(两家天数不同时常见),
 * 没有可比性 —— 不标记,而不是标成"一致"。
 */
.provider-card__daily li[data-agreement='moderate'] {
  border-left-color: rgba(184, 128, 42, 0.55);
}

.provider-card__daily li[data-agreement='low'] {
  border-left-color: rgba(192, 82, 47, 0.85);
}

:root[data-daypart='night'] .provider-card__daily li[data-agreement='moderate'] {
  border-left-color: rgba(240, 192, 120, 0.6);
}

:root[data-daypart='night'] .provider-card__daily li[data-agreement='low'] {
  border-left-color: rgba(245, 152, 120, 0.9);
}

/* 夜间天气跟在白天后面,弱化一档 —— 白天那个才是这一行的主信息 */
.day-night {
  color: var(--ink-faint);
}

.provider-card__daily li:first-child {
  border-top: none;
}

.day-name {
  color: var(--ink);
}

.day-date {
  color: var(--ink-faint);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.day-text {
  color: var(--ink-faint);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.day-low,
.day-high {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.day-low {
  color: var(--ink-dim);
}

.day-track {
  height: 4px;
  border-radius: 2px;
  background: var(--card-veil);
  overflow: hidden;
  display: block;
}

.day-bar {
  display: block;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(120, 190, 245, 0.9), rgba(255, 190, 110, 0.9));
}
</style>
