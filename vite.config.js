import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
  staged: {
    "*": "vp fmt --no-error-on-unmatched-pattern",
  },
});
