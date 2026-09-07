<script setup lang="ts">
import type { ReconciliationResult } from "core";

import ReconciliationTable from "./table/ReconciliationTable.vue";
import StatTiles from "./tiles/StatTiles.vue";

// The dashboard reads a result; it never reconciles (STANDARDS). The tiles and
// table slots now default to their real components; a later ticket fills the
// ranked-reasons slot.
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
        <p class="placeholder">Top denial reasons by dollars</p>
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

.placeholder {
  padding: 1rem;
  border: 1px dashed #bbb;
  border-radius: 6px;
  color: #666;
}
</style>
