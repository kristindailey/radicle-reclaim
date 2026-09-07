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
          <th class="actions-col">Actions</th>
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
            <td class="actions-cell">
              <!-- Inert row-actions affordance (issue #52); the click is
                   swallowed so it never toggles the row. -->
              <button
                type="button"
                class="actions-menu"
                tabindex="-1"
                aria-label="Row actions"
                @click.stop
              >
                ⋯
              </button>
            </td>
          </tr>
          <tr v-if="expanded.has(row.key)" class="detail-row">
            <td :colspan="7">
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
  width: 100%;
  border-collapse: collapse;
  font-size: var(--text-sm);
}

.recon th,
.recon td {
  padding: 0.65rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  vertical-align: middle;
}

.recon thead th {
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
  font-weight: 600;
  vertical-align: bottom;
  border-bottom: 1px solid var(--color-border-strong);
}

.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.mono {
  font-family: var(--font-mono);
  white-space: nowrap;
}

.muted {
  margin: 0;
  color: var(--color-text-faint);
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
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  white-space: nowrap;
  font-weight: 600;
  padding: 0.05rem 0.35rem;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
}

.carc-text {
  color: var(--color-text);
}

.carc-amount {
  color: var(--color-text-muted);
}

/* OPEN/CLOSED-style solid status pills, echoing fiscal-periods.png. */
.badge {
  display: inline-block;
  padding: 0.2rem 0.6rem;
  border-radius: var(--radius-pill);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  white-space: nowrap;
  color: var(--pill-text);
}

.badge--risk {
  background: var(--pill-risk-bg);
}

.badge--warning {
  background: var(--pill-warning-bg);
}

.badge--neutral {
  background: var(--pill-neutral-bg);
}

.badge--clean {
  background: var(--pill-clean-bg);
}

.warning {
  margin: 0.4rem 0 0;
  font-size: var(--text-xs);
  color: #92400e;
}

.actions-col {
  text-align: center;
  width: 1%;
}

.actions-cell {
  text-align: center;
}

.actions-menu {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-card);
  color: var(--color-text-muted);
  font-size: 1rem;
  line-height: 1;
  cursor: default;
}

.actions-menu:hover {
  background: var(--color-hover);
}

.row {
  cursor: pointer;
}

.row:hover {
  background: var(--color-surface-subtle);
}

.row:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}

.row--open {
  background: var(--color-hover);
}

.caret {
  display: inline-block;
  width: 1em;
  color: var(--color-text-faint);
  font-size: 0.7rem;
}

.detail-row > td {
  background: var(--color-surface-subtle);
  padding-top: 0.4rem;
}

.detail__title {
  margin: 0 0 0.5rem;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
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
