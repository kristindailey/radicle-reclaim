<script setup lang="ts">
// Chrome only: every nav item is inert and the active one (Dashboard) is
// hard-coded (issue #52). The inertness is deliberate, not an unfinished feature.
interface NavItem {
  label: string;
  icon: "dashboard" | "account" | "config" | "processing" | "reports";
  active?: boolean;
}

const items: NavItem[] = [
  { label: "Dashboard", icon: "dashboard", active: true },
  { label: "Account Mgmt.", icon: "account" },
  { label: "Configuration Mgmt.", icon: "config" },
  { label: "Processing", icon: "processing" },
  { label: "Reports", icon: "reports" },
];
</script>

<template>
  <nav class="sidenav" aria-label="Primary">
    <ul class="sidenav__list">
      <li v-for="item in items" :key="item.label">
        <span
          class="sidenav__item"
          :class="{ 'sidenav__item--active': item.active }"
          :aria-current="item.active ? 'page' : undefined"
        >
          <span class="sidenav__icon" aria-hidden="true">
            <svg
              v-if="item.icon === 'dashboard'"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <rect x="2" y="2" width="7" height="7" rx="1" />
              <rect x="11" y="2" width="7" height="4" rx="1" />
              <rect x="11" y="8" width="7" height="10" rx="1" />
              <rect x="2" y="11" width="7" height="7" rx="1" />
            </svg>
            <svg
              v-else-if="item.icon === 'account'"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <circle cx="8" cy="6" r="3.2" />
              <path d="M2 18c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5z" />
              <circle cx="16" cy="7" r="2.4" />
            </svg>
            <svg
              v-else-if="item.icon === 'config'"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <circle cx="6" cy="6" r="3" />
              <circle cx="14" cy="6" r="3" />
              <path d="M1 18c0-2.8 2.2-4.6 5-4.6s5 1.8 5 4.6z" />
              <path d="M10 18c0-2.8 2.2-4.6 5-4.6s4 1.8 4 4.6z" opacity="0.7" />
            </svg>
            <svg
              v-else-if="item.icon === 'processing'"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M5 2h7l3 3v13H5z" />
              <path d="M12 2v3h3" fill="#fff" opacity="0.35" />
            </svg>
            <svg v-else viewBox="0 0 20 20" fill="currentColor">
              <rect x="2" y="10" width="3.5" height="8" rx="1" />
              <rect x="8.25" y="5" width="3.5" height="13" rx="1" />
              <rect x="14.5" y="2" width="3.5" height="16" rx="1" />
            </svg>
          </span>
          {{ item.label }}
        </span>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.sidenav {
  padding: 1rem 0.75rem;
}

.sidenav__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0.25rem;
}

.sidenav__item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.65rem 0.85rem;
  border-radius: var(--radius);
  border-left: 3px solid transparent;
  color: var(--color-text);
  font-size: var(--text-sm);
  font-weight: 500;
  cursor: default;
}

.sidenav__item:hover {
  background: var(--color-hover);
}

.sidenav__item--active {
  background: var(--color-primary-soft);
  border-left-color: var(--color-primary);
  color: var(--color-primary-dark);
  font-weight: 600;
}

.sidenav__icon {
  display: inline-flex;
  width: 20px;
  height: 20px;
  color: var(--color-text-muted);
}

.sidenav__item--active .sidenav__icon {
  color: var(--color-primary);
}

.sidenav__icon svg {
  width: 100%;
  height: 100%;
}
</style>
