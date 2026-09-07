<script setup lang="ts">
import { onUnmounted, ref } from "vue";

// Dates are current, not the 2025 values frozen in the screenshots (issue #52):
// the timestamp is derived live and the copyright year comes from the clock.
// The light/dark toggle is an inert styled stub, no theme swap.
const now = ref(new Date());
const timer = setInterval(() => {
  now.value = new Date();
}, 1000 * 30);
onUnmounted(() => clearInterval(timer));

const timeFormat = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZoneName: "short",
});
</script>

<template>
  <footer class="footer">
    <div class="footer__meta">
      <span class="footer__time">{{ timeFormat.format(now) }}</span>
      <span class="footer__copy">Radicle Health © {{ now.getFullYear() }}</span>
    </div>
    <!-- Inert: a styled light/dark stub, no real theme swap. -->
    <span class="footer__toggle" role="switch" aria-checked="false" aria-label="Light / dark (stub)">
      <span class="footer__toggle-knob"></span>
    </span>
  </footer>
</template>

<style scoped>
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
}

.footer__meta {
  display: grid;
  gap: 0.15rem;
  font-size: var(--text-xs);
  color: var(--color-text-muted);
}

.footer__time {
  font-variant-numeric: tabular-nums;
}

.footer__toggle {
  display: inline-flex;
  align-items: center;
  width: 34px;
  height: 18px;
  padding: 2px;
  border-radius: var(--radius-pill);
  background: var(--color-border-strong);
  cursor: default;
}

.footer__toggle-knob {
  width: 14px;
  height: 14px;
  border-radius: var(--radius-pill);
  background: var(--color-card);
  box-shadow: var(--shadow-bar);
}
</style>
