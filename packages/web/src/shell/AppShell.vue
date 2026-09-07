<script setup lang="ts">
// The AccuBill app frame: top bar, left sidebar, footer, and a content slot.
// CHROME ONLY: the nav, Help button, avatar, and light/dark toggle are
// non-functional by design (issue #52). Nothing here routes, submits, or
// fetches; it exists so the dashboard reads as a screen inside AccuBill, not a
// standalone demo. The dashboard content is passed into the default slot.
import AppFooter from "./AppFooter.vue";
import SideNav from "./SideNav.vue";
import TopBar from "./TopBar.vue";
</script>

<template>
  <div class="shell">
    <TopBar />
    <div class="shell__body">
      <aside class="shell__sidebar">
        <SideNav />
        <AppFooter />
      </aside>
      <main class="shell__main">
        <slot />
      </main>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.shell__body {
  flex: 1;
  display: flex;
  align-items: stretch;
}

.shell__sidebar {
  display: flex;
  flex-direction: column;
  width: 250px;
  flex-shrink: 0;
  background: var(--color-card);
  border-right: 1px solid var(--color-border);
}

.shell__sidebar :deep(.sidenav) {
  flex: 1;
}

.shell__main {
  flex: 1;
  min-width: 0;
  padding: 1.75rem 2rem;
  background: var(--color-app-ground);
}

@media (max-width: 720px) {
  .shell__body {
    flex-direction: column;
  }

  .shell__sidebar {
    width: auto;
    border-right: none;
    border-bottom: 1px solid var(--color-border);
  }
}
</style>
