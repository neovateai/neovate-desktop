---
name: coss-ui-sync
description: Sync COSS UI components from shadcn registry and fix imports to relative paths
disable-model-invocation: true
argument-hint: "<components...> (e.g. @coss/ui @coss/colors-neutral, or accordion button)"
---

# Add shadcn/ui Components

This project is an Electron app with the renderer source at `src/renderer/src/`. The shadcn CLI generates files with `@/` alias imports, but this project uses relative imports in renderer code. After running the CLI, a post-processing script converts `@/` → relative paths.

## Steps

1. Ensure `tsconfig.json` has the `paths` alias that shadcn needs to resolve output paths. Read the current `tsconfig.json` and add the paths entry if missing:

   ```jsonc
   // tsconfig.json compilerOptions must include:
   "paths": { "@/*": ["./src/renderer/src/*"] }
   ```

   If `compilerOptions` doesn't exist, add it. If `paths` already contains the entry, skip this step.

2. Run the shadcn CLI to add components:

   ```bash
   bunx --bun shadcn@latest add <components...> --overwrite
   ```

3. Run the import fixer to convert `@/` alias imports to relative imports:

   ```bash
   bun .claude/skills/coss-ui-sync/scripts/fix-imports.ts
   ```

4. Remove the `paths` entry from `tsconfig.json` that was added in step 1. The final `tsconfig.json` should not contain the `paths` key in `compilerOptions`. If `compilerOptions` is left empty, remove it too.

5. Report what was added and how many files were fixed.

## Important Notes

- The `paths` alias is only needed temporarily for the shadcn CLI to resolve where to place files. It must be removed afterward so it doesn't conflict with the project's actual TypeScript config.
- The `components.json` at project root uses `@/` aliases. This is intentional — shadcn needs them to place files in `src/renderer/src/`.
- The `@coss` registry (`https://coss.com/ui/r/{name}.json`) provides Base UI components. Use `@coss/` prefix for Base UI variants (e.g. `@coss/accordion`, `@coss/ui` for all).
- Always pass `--overwrite` to avoid interactive prompts.
- For `@coss/colors-*` packages, the CLI may prompt for confirmation about overwriting styles — pipe `echo "y"` if needed.
