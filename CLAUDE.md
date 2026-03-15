# Neovate Desktop

## Project Info

- Electron desktop app (monorepo, single package at `packages/desktop/`)
- Settings directory: `~/.neovate-desktop`
- Package manager: `bun`

## Architecture

Three Electron processes with strict separation:

- **main** (`src/main/`) — Node.js: app lifecycle, IPC server, ACP subprocesses, plugins
- **renderer** (`src/renderer/src/`) — React 19 + Zustand + Tailwind: all UI
- **preload** (`src/preload/`) — context bridge, MessagePort forwarding
- **shared** (`src/shared/`) — oRPC contracts and types shared between main/renderer

IPC: oRPC over MessagePort (contracts in `src/shared/contract.ts`, client in `src/renderer/src/orpc.ts`)

## Process Boundaries

- NEVER import from `src/main/` in renderer code or vice versa
- NEVER import `electron` in renderer code
- The only shared code lives in `src/shared/`
- electron-vite enforces this at build time — violations cause cryptic errors

## Adding a New IPC Method

1. Define contract in `src/shared/features/<domain>/contract.ts` (zod schema)
2. Implement handler in `src/main/features/<domain>/router.ts`
3. Call from renderer via `client.<domain>.<method>()` (import client from `src/renderer/src/orpc.ts`)

## Renderer State

- All stores use: `create<State>()(immer((set, get) => ({ ... })))`
- Stores call oRPC client for persistence, update local state optimistically
- Convention: one store per feature at `features/<name>/store.ts`

## Commands

- `bun dev` — start dev server with hot reload
- `bun check` — typecheck + lint + format check
- `bun test:run` — unit tests (vitest)
- `bun ready` — full pre-push readiness check (format + check + test)
- `bun lint` — oxlint
- `bun format` — oxfmt

## Before Finishing

Run `bun ready` — it runs format check + typecheck + lint + tests. This is the same gate CI enforces.

## Code Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`)
- Linter: oxlint. Formatter: oxfmt. NOT eslint/prettier.
- Relative imports in renderer code (no `@/` aliases)
- `components/ui/` files are shadcn-generated — use `/coss-ui-sync` skill to add/update, don't edit by hand
- Debug logging: `import debug from "debug"` with `neovate:` namespace prefix
- Validation: zod schemas in shared contracts
- Plugin pattern: `MainPlugin` interface in `src/main/core/plugin/types.ts`

## Library Choices (don't suggest alternatives)

- Animations: `motion` (not framer-motion)
- Headless UI: `@base-ui/react` (not radix)
- Linter: `oxlint` (not eslint)
- Formatter: `oxfmt` (not prettier)
- Tailwind CSS 4 (CSS-first config, no tailwind.config.js)
- Zod 4 (not zod 3)
- Icons: `@hugeicons/core-free-icons`
