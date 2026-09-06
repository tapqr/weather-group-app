<script setup lang="ts">
import { computed } from 'vue';
import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudMoon,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  Snowflake,
  CloudFog,
  Wind,
  Haze,
} from 'lucide-vue-next';

const props = withDefaults(
  defineProps<{
    name?: string;
    size?: number | string;
    class?: string;
  }>(),
  {
    name: 'Sun',
    size: 24,
    class: '',
  }
);

const iconComponent = computed(() => {
  switch (props.name) {
    case 'Sun':
      return Sun;
    case 'Moon':
      return Moon;
    case 'Cloud':
      return Cloud;
    case 'CloudSun':
      return CloudSun;
    case 'CloudMoon':
      return CloudMoon;
    case 'CloudRain':
      return CloudRain;
    case 'CloudDrizzle':
      return CloudDrizzle;
    case 'CloudLightning':
      return CloudLightning;
    case 'Snowflake':
      return Snowflake;
    case 'CloudFog':
      return CloudFog;
    case 'Wind':
      return Wind;
    case 'Haze':
      return Haze;
    default:
      return CloudSun;
  }
});
</script>

<template>
  <component :is="iconComponent" :size="size" :class="props.class" />
</template>
