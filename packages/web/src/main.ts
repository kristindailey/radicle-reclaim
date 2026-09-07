import { createApp } from "vue";

import App from "./App.vue";
import { sixOutcomeResult } from "./fixtures/six-outcomes.result";

// The scaffold mounts over the fixture result. In the real app this comes from
// AppSync (infra spec); either way the web layer reads it, never reconciles it.
createApp(App, { result: sixOutcomeResult }).mount("#app");
