import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 30_000,
  use: {
    trace: "on-first-retry",
  },
});
