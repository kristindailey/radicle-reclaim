<script setup lang="ts">
import type { ReconciliationResult } from "core";

import TopDenialReasons from "./reasons/TopDenialReasons.vue";
import ReconciliationTable from "./table/ReconciliationTable.vue";
import StatTiles from "./tiles/StatTiles.vue";

// The dashboard reads a result; it never reconciles (STANDARDS). Every section
// slot now defaults to its real component.
defineProps<{ result: ReconciliationResult }>();
</script>

<template>
  <main class="dashboard">
    <header class="dashboard__header">
      <h1>Reclaim: denial analytics</h1>
      <p>835 control {{ result.controlNumber }}</p>
    </header>

    <section class="dashboard__tiles">
      <slot name="tiles" :result="result">
        <StatTiles :result="result" />
      </slot>
    </section>

    <section class="dashboard__table">
      <slot name="table" :result="result">
        <ReconciliationTable :result="result" />
      </slot>
    </section>

    <section class="dashboard__reasons">
      <slot name="reasons" :result="result">
        <TopDenialReasons :result="result" />
      </slot>
    </section>
  </main>
</template>

<style scoped>
.dashboard {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}

.dashboard__header {
  margin-bottom: 1.5rem;
}

.dashboard section {
  margin-bottom: 1.5rem;
}
</style>
