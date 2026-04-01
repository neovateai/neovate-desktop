import { defineProject } from "vitest/config";

export default defineProject({
  define: {
    __APP_NAME__: JSON.stringify("Neovate"),
    __APP_ID__: JSON.stringify("neovate-desktop"),
    __DEEPLINK_SCHEME__: JSON.stringify("neovate"),
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    typecheck: {
      enabled: true,
    },
  },
});
