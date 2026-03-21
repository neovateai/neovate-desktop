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
- `bun check` — lint + format (via `vp check`) + typecheck (via `tsgo`)
- `bun test:run` — unit tests (via `vp test`)
- `bun ready` — full pre-push readiness check (format + check + test)
- `bun lint` — lint (via `vp lint`)
- `bun format` — format (via `vp fmt`)

## Before Finishing

Run `bun ready` — it runs format check + typecheck + lint + tests. This is the same gate CI enforces.

## Code Conventions

- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`)
- Toolchain: `vite-plus` for lint/fmt/test/check (wraps oxlint + oxfmt + vitest). NOT eslint/prettier.
- Relative imports in renderer code (no `@/` aliases)
- `components/ui/` files are shadcn-generated — use `/coss-ui-sync` skill to add/update, don't edit by hand
- Debug logging: `import debug from "debug"` with `neovate:` namespace prefix
- Validation: zod schemas in shared contracts
- Plugin pattern: `MainPlugin` interface in `src/main/core/plugin/types.ts`

## Library Choices (don't suggest alternatives)

- Animations: `motion` (not framer-motion)
- Headless UI: `@base-ui/react` (not radix)
- Toolchain: `vite-plus` — unified lint/fmt/test/check (not eslint/prettier)
- Linter: `oxlint` via vite-plus (not eslint)
- Formatter: `oxfmt` via vite-plus (not prettier)
- Tailwind CSS 4 (CSS-first config, no tailwind.config.js)
- Zod 4 (not zod 3)
- Icons: `lucide-react` (general use), `@hugeicons/core-free-icons` (sidebar/plugin icons)

## Design Context

### Users

Professional developers who use AI-assisted coding tools daily. They value efficiency, speed, and control. The interface should evoke **confidence and focus** — never get in the way, always feel fast.

### Brand Personality

**Minimal, quiet, elegant.** Understated sophistication like iA Writer or Things. The hot pink primary (`#fa216e`) provides a single bold accent against otherwise restrained, neutral surfaces.

### Aesthetic Direction

- **Visual tone:** Clean, spacious, low-contrast surfaces with precise typography and subtle depth. Information-dense when needed, but never cluttered.
- **References:** Claude/ChatGPT conversational AI interfaces — clean chat with clear message hierarchy, generous whitespace, readable markdown rendering.
- **Anti-references:** Overly decorative UIs, heavy gradients, gamified elements, neon/cyberpunk aesthetics.
- **Theme:** Full light and dark mode. Light uses cool gray-blue (`#f5f7fa`) backgrounds; dark uses near-black neutrals. Both themes share the `#fa216e` accent.
- **Logo:** Geometric angular arrow mark — sharp, abstract, black/white. Matches the minimal brand voice.

### Design Principles

1. **Quiet confidence** — The UI should feel calm and authoritative. Avoid visual noise, excessive borders, and competing focal points. Let content breathe.
2. **Developer-first density** — Respect screen real estate. Provide information density when developers need it (code, diffs, terminals) while keeping chat conversational and spacious.
3. **One accent, used sparingly** — `#fa216e` is the single brand color. Use it for primary actions and key interactive states only. Everything else stays neutral.
4. **Motion with purpose** — Animations should orient and inform, never decorate. Use `motion` library for transitions that help users track state changes.
5. **Consistent primitives** — Build from the existing shadcn/base-ui component library. Maintain consistent spacing, radius (`0.625rem`), and token usage across all features.
