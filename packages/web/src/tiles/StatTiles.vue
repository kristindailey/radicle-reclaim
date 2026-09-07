<script setup lang="ts">
import { computed } from "vue";

import type { ReconciliationResult } from "core";

import { useStatTiles } from "./useStatTiles";

// Reads the result the dashboard already holds; the composable derives the
// figures (STANDARDS). The hero renders large and apart from the rest.
const props = defineProps<{ result: ReconciliationResult }>();

const tiles = useStatTiles(() => props.result);
const hero = computed(() => tiles.value.find((tile) => tile.hero));
const rest = computed(() => tiles.value.filter((tile) => !tile.hero));
</script>

<template>
  <div class="tiles">
    <div v-if="hero" class="tile tile--hero">
      <p class="tile__label">{{ hero.label }}</p>
      <p class="tile__value">{{ hero.value }}</p>
    </div>

    <div class="tiles__grid">
      <div v-for="tile in rest" :key="tile.key" class="tile">
        <p class="tile__label">{{ tile.label }}</p>
        <p class="tile__value">{{ tile.value }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tiles {
  display: grid;
  gap: 1rem;
}

.tiles__grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 1rem;
}

.tile {
  padding: 1rem 1.25rem;
  border: 1px solid #e2e2e2;
  border-radius: 8px;
  background: #fff;
}

.tile--hero {
  border-color: #b91c1c;
  background: #fef2f2;
}

.tile__label {
  margin: 0 0 0.5rem;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #666;
}

.tile--hero .tile__label {
  color: #b91c1c;
}

.tile__value {
  margin: 0;
  font-variant-numeric: tabular-nums;
  font-size: 1.5rem;
  font-weight: 600;
}

.tile--hero .tile__value {
  font-size: 2.5rem;
  color: #b91c1c;
}
</style>
