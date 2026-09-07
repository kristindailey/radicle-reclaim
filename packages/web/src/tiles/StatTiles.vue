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
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-card);
  box-shadow: var(--shadow-card);
}

.tile--hero {
  border-color: var(--color-primary);
  background: var(--color-primary);
}

.tile__label {
  margin: 0 0 0.5rem;
  font-size: var(--text-xs);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.tile--hero .tile__label {
  color: rgba(255, 255, 255, 0.85);
}

.tile__value {
  /* Push the value to the tile's foot so figures line up across the row even
     when a label wraps to two lines. */
  margin: auto 0 0;
  font-variant-numeric: tabular-nums;
  font-size: var(--text-xl);
  font-weight: 700;
  color: var(--color-text);
}

.tile--hero .tile__value {
  font-size: var(--text-hero);
  color: var(--color-card);
}
</style>
