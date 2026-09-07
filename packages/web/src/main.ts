import { createApp } from "vue";

import App from "./App.vue";
import "./shell/tokens.css";
import { createAppSyncReader, readAppSyncConfig } from "./api/client";
import { loadReconciliationResult } from "./api/loadReconciliationResult";
import { sixOutcomeResult } from "./fixtures/six-outcomes.result";

// The dashboard reads live ingested data from the AppSync read API (issue #33) when
// VITE_APPSYNC_URL and VITE_APPSYNC_API_KEY are set. With no stack configured it falls
// back to the checked-in six-outcome synthetic fixture (no PHI), so the dashboard
// renders as a static, backend-free demo with no API key in the bundle. Either path
// only renders a result; it never reconciles (STANDARDS).
async function bootstrap(): Promise<void> {
  const mount = document.querySelector("#app");
  try {
    const hasStack =
      import.meta.env.VITE_APPSYNC_URL && import.meta.env.VITE_APPSYNC_API_KEY;
    const result = hasStack
      ? await loadReconciliationResult(createAppSyncReader(readAppSyncConfig()))
      : sixOutcomeResult;
    createApp(App, { result }).mount("#app");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load the dashboard.";
    if (mount) {
      mount.textContent = message;
    }
  }
}

void bootstrap();
