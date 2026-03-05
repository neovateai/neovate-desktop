import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.{ts,tsx}", "test/**/*.test.{ts,tsx}"],
    typecheck: {
      enabled: true,
    },
  },
});
