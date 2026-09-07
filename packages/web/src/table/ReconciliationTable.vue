<script setup lang="ts">
import { ref } from "vue";

import type { ReconciliationResult } from "core";

import { useReconciliationTable } from "./useReconciliationTable";

// Reads the result the dashboard already holds; the composable derives the rows,
// decoding codes and formatting money, so this component only lays them out
// (STANDARDS).
const props = defineProps<{ result: ReconciliationResult }>();

const rows = useReconciliationTable(() => props.result);

// Which rows have their proposed-line detail revealed. Clicking a row toggles it:
// a reviewer reads what would post, pending review, before it posts (D5).
const expanded = ref(new Set<string>());

function toggle(key: string): void {
  const next = new Set(expanded.value);
  if (next.has(key)) {
    next.delete(key);
  } else {
    next.add(key);
  }
  expanded.value = next;
}
</script>

<template>
  <div class="table-wrap">
    <table class="recon">
      <thead>
        <tr>
          <th>Claim control</th>
          <th>Line</th>
          <th class="num">Billed</th>
          <th class="num">Paid</th>
          <th>Adjustments</th>
          <th>Disposition</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="row in rows" :key="row.key">
          <tr
            class="row"
            :class="{ 'row--open': expanded.has(row.key) }"
            role="button"
            tabindex="0"
            :aria-expanded="expanded.has(row.key)"
            @click="toggle(row.key)"
            @keydown.enter.prevent="toggle(row.key)"
            @keydown.space.prevent="toggle(row.key)"
          >
            <td class="mono">
              <span class="caret" aria-hidden="true">{{ expanded.has(row.key) ? "▾" : "▸" }}</span>
              {{ row.claimControlNumber }}
            </td>
            <td class="num">{{ row.lineNumber }}</td>
            <td class="num">{{ row.billed }}</td>
            <td class="num">{{ row.paid }}</td>
            <td>
              <p v-if="row.adjustments.length === 0" class="muted">None</p>
              <ul v-else class="adjustments">
                <li v-for="(adj, i) in row.adjustments" :key="i" class="adjustment">
                  <span class="group">{{ adj.groupCode }} {{ adj.carc }}</span>
                  <span class="carc-text">{{ adj.carcText }}</span>
                  <span class="num carc-amount">{{ adj.amount }}</span>
                </li>
              </ul>
            </td>
            <td>
              <span class="badge" :class="`badge--${row.disposition.tone}`">
                {{ row.disposition.label }}
              </span>
              <p v-if="row.balanceWarning" class="warning">{{ row.balanceWarning }}</p>
            </td>
          </tr>
          <tr v-if="expanded.has(row.key)" class="detail-row">
            <td :colspan="6">
              <div class="detail">
                <p class="detail__title">Proposed lines · pending review</p>
                <p v-if="row.proposedLines.length === 0" class="muted">
                  No proposed lines for this line.
                </p>
                <ul v-else class="proposed">
                  <li
                    v-for="proposed in row.proposedLines"
                    :key="proposed.idempotencyKey"
                    class="proposed__line"
                  >
                    <span class="proposed__kind" :class="`proposed__kind--${proposed.kind}`">
                      {{ proposed.kindLabel }}
                    </span>
                    <span class="proposed__status">{{ proposed.statusLabel }}</span>
                    <span v-if="proposed.groupCode" class="group">
                      {{ proposed.groupCode }} {{ proposed.carc }}
                    </span>
                    <span class="num proposed__amount">{{ proposed.amount }}</span>
                  </li>
                </ul>
              </div>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.table-wrap {
  overflow-x: auto;
}

.recon {
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.recon th,
.recon td {
  padding: 0.6rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #e2e2e2;
  vertical-align: top;
}

.recon thead th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #666;
  border-bottom-width: 2px;
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mono {
  font-family: var(--mono);
}

.muted {
  margin: 0;
  color: #999;
}

.adjustments {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.35rem;
}

.adjustment {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 0.5rem;
  align-items: baseline;
}

.group {
  font-family: var(--mono);
  font-size: 0.75rem;
  white-space: nowrap;
  font-weight: 600;
  padding: 0.05rem 0.35rem;
  border: 1px solid #d0d0d0;
  border-radius: 4px;
  color: #444;
}

.carc-text {
  color: #333;
}

.carc-amount {
  color: #666;
}

.badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

.badge--risk {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #f3c0c0;
}

.badge--warning {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #f5d98b;
}

.badge--neutral {
  background: #f3f4f6;
  color: #374151;
  border: 1px solid #d9dce1;
}

.badge--clean {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbe6c8;
}

.warning {
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  color: #92400e;
}

.row {
  cursor: pointer;
}

.row:hover {
  background: #f8fafc;
}

.row:focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: -2px;
}

.row--open {
  background: #f1f5f9;
}

.caret {
  display: inline-block;
  width: 1em;
  color: #999;
  font-size: 0.7rem;
}

.detail-row > td {
  background: #f8fafc;
  padding-top: 0.4rem;
}

.detail__title {
  margin: 0 0 0.5rem;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #666;
}

.proposed {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.4rem;
}

.proposed__line {
  display: grid;
  grid-template-columns: auto auto auto 1fr;
  gap: 0.6rem;
  align-items: baseline;
  font-size: 0.85rem;
}

.proposed__kind {
  font-weight: 600;
  padding: 0.05rem 0.4rem;
  border-radius: 4px;
  white-space: nowrap;
}

.proposed__kind--payment {
  background: #f0fdf4;
  color: #166534;
  border: 1px solid #bbe6c8;
}

.proposed__kind--adjustment {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfd4f5;
}

.proposed__status {
  font-size: 0.75rem;
  color: #92400e;
  white-space: nowrap;
}

.proposed__amount {
  color: #333;
  font-weight: 600;
}
</style>
