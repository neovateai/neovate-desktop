import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    environment: "node",
    include: ["src/**/__tests__/**/*.test.ts", "test/**/*.test.ts"],
  },
});
