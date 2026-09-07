import { createApp } from "vue";

import App from "./App.vue";
import { createAppSyncReader, readAppSyncConfig } from "./api/client";
import { loadReconciliationResult } from "./api/loadReconciliationResult";

// The dashboard reads live ingested data from the AppSync read API (issue #33); it
// renders the result, it never reconciles (STANDARDS). The fixture harness stays
// for the tests, not the app.
async function bootstrap(): Promise<void> {
  try {
    const reader = createAppSyncReader(readAppSyncConfig());
    const result = await loadReconciliationResult(reader);
    createApp(App, { result }).mount("#app");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load the dashboard.";
    const mount = document.querySelector("#app");
    if (mount) {
      mount.textContent = message;
    }
  }
}

void bootstrap();
