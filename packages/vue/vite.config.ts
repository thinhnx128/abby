/// <reference types="vitest" />

import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      vue: new URL("./src/vue-runtime.ts", import.meta.url).pathname,
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
  },
});
