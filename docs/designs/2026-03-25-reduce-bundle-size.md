# Reduce Bundle Size

## 1. Background

Electron app bundle includes renderer-only npm packages in the packaged `node_modules`, even though Vite already bundles them into `dist/renderer/`. This wastes space since electron-builder packages all `dependencies` into the app. Referenced neovateai/neovate-code-desktop#34 for the approach.

## 2. Requirements Summary

**Goal:** Reduce Electron app bundle size by moving renderer-only packages from `dependencies` to `devDependencies`.

**Scope:**

- In scope: Dependency categorization, electron-builder file exclusion cleanup
- Out of scope: Code splitting, tree-shaking, compression changes

## 3. Acceptance Criteria

1. All renderer-only packages are in `devDependencies`
2. All main/preload/shared runtime packages remain in `dependencies`
3. Redundant `!**/node_modules/...` file exclusion patterns are removed
4. `bun ready` passes (typecheck + lint + format + tests)

## 4. Problem Analysis

The project had 31 renderer-only packages (React components, UI libraries, markdown renderers, animation libs) in `dependencies`. Electron-builder includes all production dependencies in the packaged app's `node_modules`. Since the renderer is fully bundled by Vite, these packages and their transitive dependency trees are dead weight.

Previous workaround: Manual `!**/node_modules/...` exclusion patterns in electron-builder.mjs — fragile and incomplete (missed ~15 packages).

**Chosen approach:** Move packages to `devDependencies` so electron-builder automatically excludes them.

## 5. Decision Log

**1. How to categorize each package?**

- Options: A) Grep for imports in src/main/, src/preload/, src/shared/ · B) Guess based on package name
- Decision: **A)** — Evidence-based. Used subagent to verify every borderline package (ai, i18next, fuse.js, zod, etc.)

**2. What about packages bundled by Vite but in dependencies (electron-store, @electron-toolkit/preload)?**

- Options: A) Move to devDeps since they're bundled · B) Leave in deps for safety
- Decision: **B)** — Conservative. These are small and moving them risks subtle breakage if they have side effects outside the bundle.

## 6. Design

### Packages moved to devDependencies (31 total)

UI/React: `@dnd-kit/*` (4), `@radix-ui/*` (2), `@tiptap/*` (6), `ansi-to-react`, `embla-carousel-react`, `react-grab`, `use-stick-to-bottom`

Rendering: `@pierre/diffs`, `@streamdown/*` (4), `katex`, `shiki`, `streamdown`

State/i18n: `i18next`, `i18next-browser-languagedetector`, `immer`, `react-i18next`

Other renderer-only: `date-fns`, `motion`, `tokenlens`

### Packages kept in dependencies (20 total)

Main process: `@anthropic-ai/claude-agent-sdk`, `@anthropic-ai/sdk`, `adm-zip`, `ai`, `chokidar`, `debug`, `electron-log`, `electron-store`, `electron-updater`, `fuse.js`, `get-port`, `node-pty`, `simple-git`, `tar`

Preload/shared: `@electron-toolkit/preload`, `@electron-toolkit/utils`, `@orpc/contract`, `@orpc/server`, `minimatch`, `zod`

### electron-builder.mjs cleanup

Removed 22 `!**/node_modules/...` exclusion lines for packages now in devDependencies. Kept platform-specific exclusions (linux ripgrep, win32 node-pty).

## 7. Files Changed

- `packages/desktop/package.json` — Move 31 renderer-only packages from dependencies to devDependencies
- `packages/desktop/configs/electron-builder.mjs` — Remove 22 redundant file exclusion patterns

## 8. Verification

1. [AC1-2] Verified each package's process usage via grep in src/main/, src/preload/, src/shared/
2. [AC3] Removed all renderer-only exclusion patterns, kept platform-specific ones
3. [AC4] `bun ready` passes
