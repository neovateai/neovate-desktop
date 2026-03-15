# Renderer Process

React 19 single-page application. All UI lives here.

- State: Zustand with immer middleware (`create<T>()(immer(...))`)
- Styling: Tailwind CSS 4 (CSS-first, no config file)
- UI primitives: `components/ui/` are shadcn-generated — don't edit directly, use `/coss-ui-sync` skill
- Imports must be relative (no `@/` alias)
- oRPC client: `import { client } from "../../orpc"` (adjust relative path as needed)
- Never import from `src/main/` or `electron` — use oRPC for all main-process communication
