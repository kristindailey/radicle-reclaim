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
.reasons {
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
}

.reasons__title {
  margin: 0 0 0.75rem;
  font-size: 1rem;
}

.muted {
  margin: 0;
  color: #999;
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
  padding: 0.6rem 0.75rem;
  border: 1px solid #e2e2e2;
  border-radius: 6px;
  background: #fff;
  font-size: 0.9rem;
}

.reason__rank {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  color: #b91c1c;
  min-width: 1.25rem;
}

.reason__code {
  font-family: var(--mono);
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.05rem 0.35rem;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  color: #444;
  white-space: nowrap;
}

.reason__text {
  color: #333;
}

.reason__amount {
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
  color: #b91c1c;
}
</style>
