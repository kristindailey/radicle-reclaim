<script setup lang="ts">
// Chrome only: the Help button and avatar are inert by design (issue #52).
import logoUrl from "../assets/logo.png";
</script>

<template>
  <header class="topbar">
    <div class="topbar__brand">
      <img :src="logoUrl" alt="" class="topbar__logo" />
      <span class="topbar__wordmark">
        <span class="topbar__wordmark-accu">Accu</span
        ><span class="topbar__wordmark-bill">Bill</span>
      </span>
    </div>

    <div class="topbar__actions">
      <!-- Inert: styled to match accubill-screenshot.png, does nothing. -->
      <button type="button" class="topbar__help" tabindex="-1">
        <span class="topbar__help-icon" aria-hidden="true">?</span>
        Help
        <span class="topbar__help-caret" aria-hidden="true">▾</span>
      </button>
      <div class="topbar__avatar" aria-hidden="true">JC</div>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 1.5rem;
  background: var(--color-card);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-bar);
}

.topbar__brand {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.topbar__logo {
  width: 40px;
  height: auto;
}

.topbar__wordmark {
  font-size: 1.5rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.topbar__wordmark-accu {
  color: var(--color-primary-dark);
}

.topbar__wordmark-bill {
  color: var(--color-text);
  font-style: italic;
  font-weight: 400;
}

.topbar__actions {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.topbar__help {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.45rem 0.85rem;
  background: var(--color-action);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: var(--text-sm);
  font-weight: 600;
  font-family: inherit;
  white-space: nowrap;
  cursor: default;
}

.topbar__help:hover {
  background: var(--color-action-dark);
}

.topbar__help-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1rem;
  height: 1rem;
  border: 1.5px solid currentColor;
  border-radius: var(--radius-pill);
  font-size: 0.7rem;
  font-weight: 700;
}

.topbar__help-caret {
  font-size: 0.6rem;
}

.topbar__avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: var(--radius-pill);
  background: #7c6bd6;
  color: #fff;
  font-size: var(--text-xs);
  font-weight: 700;
}
</style>
