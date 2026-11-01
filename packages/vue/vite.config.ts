/// <reference types="vitest" />

import { existsSync } from "node:fs";
import { defineConfig } from "vite";

const hasInstalledVue =
  existsSync(new URL("./node_modules/vue", import.meta.url)) ||
  existsSync(new URL("../../node_modules/vue", import.meta.url));

export default defineConfig({
  resolve: {
    alias: hasInstalledVue
      ? {}
      : {
          vue: new URL("./src/vue-runtime.ts", import.meta.url).pathname,
        },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
