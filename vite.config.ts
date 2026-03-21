import { defineConfig } from "vite-plus";

export default defineConfig({
  test: {
    projects: ["packages/*"],
  },
  fmt: {
    ignorePatterns: [".claude/**", "packages/desktop/resources/**"],
    sortImports: {
      groups: [
        "type-import",
        ["value-builtin", "value-external"],
        "type-internal",
        "value-internal",
        ["type-parent", "type-sibling", "type-index"],
        ["value-parent", "value-sibling", "value-index"],
        "unknown",
      ],
      newlinesBetween: true,
    },
  },
  lint: {
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  staged: {
    "*": "vp fmt --no-error-on-unmatched-pattern",
  },
});
