import { defineProject } from "vitest/config";

export default defineProject({
  define: {
    __APP_NAME__: JSON.stringify("Neovate"),
    __APP_ID__: JSON.stringify("neovate-desktop"),
  },
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    typecheck: {
      enabled: true,
    },
  },
});
