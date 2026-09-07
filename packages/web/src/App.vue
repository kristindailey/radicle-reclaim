<script setup lang="ts">
import type { ReconciliationResult } from "core";

import TopDenialReasons from "./reasons/TopDenialReasons.vue";
import AppShell from "./shell/AppShell.vue";
import ReconciliationTable from "./table/ReconciliationTable.vue";
import StatTiles from "./tiles/StatTiles.vue";

// The dashboard reads a result; it never reconciles (STANDARDS). The content now
// sits inside the AccuBill app shell (chrome only, non-functional by design,
// issue #52), with a breadcrumb and page header matching fiscal-periods.png.
defineProps<{ result: ReconciliationResult }>();
</script>

<template>
  <AppShell>
    <div class="page">
      <nav class="page__breadcrumb" aria-label="Breadcrumb">
        <span>Dashboard</span>
        <span class="page__crumb-sep" aria-hidden="true">›</span>
        <span class="page__crumb-current">Reclaim</span>
      </nav>

      <header class="page__header">
        <h1 class="page__title">Reclaim</h1>
        <p class="page__subtitle">
          835 Remittance Reconciliation · Control
          <span class="page__control">{{ result.controlNumber }}</span>
        </p>
      </header>

      <section class="page__section">
        <slot name="tiles" :result="result">
          <StatTiles :result="result" />
        </slot>
      </section>

      <section class="page__section card">
        <slot name="table" :result="result">
          <ReconciliationTable :result="result" />
        </slot>
      </section>

      <section class="page__section card">
        <slot name="reasons" :result="result">
          <TopDenialReasons :result="result" />
        </slot>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.page {
  max-width: 1280px;
}

.page__breadcrumb {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
  margin-bottom: 0.75rem;
}

.page__crumb-sep {
  color: var(--color-text-faint);
}

.page__crumb-current {
  color: var(--color-text);
  font-weight: 600;
}

.page__header {
  margin-bottom: 1.5rem;
}

.page__title {
  margin: 0 0 0.35rem;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text);
}

.page__subtitle {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-text-muted);
}

.page__control {
  font-family: var(--font-mono);
  color: var(--color-text);
}

.page__section {
  margin-bottom: 1.5rem;
}

.card {
  padding: 1.25rem 1.5rem;
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
}
</style>
