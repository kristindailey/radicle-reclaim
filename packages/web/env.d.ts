/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APPSYNC_URL: string;
  readonly VITE_APPSYNC_API_KEY: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, unknown>;
  export default component;
}
