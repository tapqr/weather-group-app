<script setup lang="ts">
import type { Consensus } from '../utils/consensus';

/*
 * 共识/分歧卡。
 *
 * 这是页面上唯一"替用户下判断"的地方,和产品其余部分刻意保持的中立姿态不同 ——
 * 但下的是**关于分歧本身**的判断("两家在这件事上不一致"),不是"哪家更准"。
 * 后者始终留给用户,这也是整个应用存在的理由。
 */
defineProps<{ consensus: Consensus }>();

const LEVEL_MARK: Record<Consensus['level'], string> = {
  high: '✓',
  moderate: '≈',
  divergent: '!',
};
</script>

<template>
  <section class="consensus" :data-level="consensus.level">
    <header class="consensus__head">
      <span class="consensus__mark" aria-hidden="true">{{ LEVEL_MARK[consensus.level] }}</span>
      <h2>{{ consensus.headline }}</h2>
    </header>

    <dl class="consensus__facts">
      <div>
        <dt>气温</dt>
        <dd>{{ consensus.tempNote }}</dd>
      </div>
      <div>
        <dt>降水</dt>
        <dd>{{ consensus.rainNote }}</dd>
      </div>
    </dl>

    <ul v-if="consensus.notes.length > 0" class="consensus__notes">
      <li v-for="note in consensus.notes" :key="note">{{ note }}</li>
    </ul>
  </section>
</template>

<style scoped>
.consensus {
  --accent: var(--ink-dim);

  border-radius: var(--radius-card);
  border: 1px solid var(--card-border);
  background: linear-gradient(150deg, rgba(13, 36, 54, 0.07), rgba(13, 36, 54, 0.03));
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

:root[data-daypart='night'] .consensus {
  background: linear-gradient(150deg, rgba(4, 8, 24, 0.28), rgba(4, 8, 24, 0.18));
}

/* 三档用色相区分,而不是只靠文字 —— 分歧要能被扫一眼扫到 */
.consensus[data-level='high'] {
  --accent: #2f8f6b;
}
.consensus[data-level='moderate'] {
  --accent: #b8802a;
}
.consensus[data-level='divergent'] {
  --accent: #c0522f;
}

/* 夜间背景暗,同色相要提亮才够对比度 */
:root[data-daypart='night'] .consensus[data-level='high'] {
  --accent: #6fd5ac;
}
:root[data-daypart='night'] .consensus[data-level='moderate'] {
  --accent: #f0c078;
}
:root[data-daypart='night'] .consensus[data-level='divergent'] {
  --accent: #f59878;
}

.consensus__head {
  display: flex;
  align-items: center;
  gap: 9px;
}

.consensus__mark {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--accent);
  border: 1.5px solid var(--accent);
}

.consensus__head h2 {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.3px;
  color: var(--accent);
}

.consensus__facts {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.consensus__facts div {
  display: grid;
  grid-template-columns: 34px 1fr;
  gap: 10px;
  align-items: baseline;
}

.consensus__facts dt {
  font-size: 11px;
  color: var(--ink-faint);
}

.consensus__facts dd {
  margin: 0;
  font-size: 13px;
  color: var(--ink-dim);
  font-variant-numeric: tabular-nums;
}

.consensus__notes {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding-top: 4px;
  border-top: 1px solid var(--card-veil);
}

.consensus__notes li {
  font-size: 12px;
  color: var(--ink-faint);
  padding-left: 11px;
  position: relative;
  font-variant-numeric: tabular-nums;
}

.consensus__notes li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.5em;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--accent);
  opacity: 0.7;
}
</style>
