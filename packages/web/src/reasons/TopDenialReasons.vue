<script setup lang="ts">
import type { ReconciliationResult } from "core";

import { useTopDenialReasons } from "./useTopDenialReasons";

// Reads the result the dashboard already holds; the composable derives the ranked
// list, decoding CARCs and formatting money, so this component only lays them out
// (STANDARDS).
const props = defineProps<{ result: ReconciliationResult }>();

const reasons = useTopDenialReasons(() => props.result);
</script>

<template>
  <div class="reasons">
    <h2 class="reasons__title">Top denial reasons by dollars</h2>
    <p v-if="reasons.length === 0" class="muted">No recoverable denials in this remittance.</p>
    <ol v-else class="reasons__list">
      <li v-for="(reason, i) in reasons" :key="reason.carc" class="reason">
        <span class="reason__rank" aria-hidden="true">{{ i + 1 }}</span>
        <span class="reason__code">{{ reason.carc }}</span>
        <span class="reason__text">{{ reason.carcText }}</span>
        <span class="reason__amount">{{ reason.dollars }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.reasons__title {
  margin: 0 0 0.9rem;
  font-size: var(--text-lg);
  font-weight: 700;
  color: var(--color-text);
}

.muted {
  margin: 0;
  color: var(--color-text-faint);
}

.reasons__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.4rem;
}

.reason {
  display: grid;
  grid-template-columns: auto auto 1fr auto;
  gap: 0.75rem;
  align-items: baseline;
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius);
  background: var(--color-card);
  font-size: var(--text-sm);
}

.reason__rank {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: var(--color-action);
  min-width: 1.25rem;
}

.reason__code {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 600;
  padding: 0.05rem 0.35rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  white-space: nowrap;
}

.reason__text {
  color: var(--color-text);
}

.reason__amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  white-space: nowrap;
  color: var(--color-action);
}
</style>
