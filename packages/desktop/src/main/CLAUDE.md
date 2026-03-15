# Main Process

Electron main process (Node.js). Runs IPC server, manages ACP subprocesses, and hosts plugins.

- Logging: `import debug from "debug"` with `debug("neovate:<namespace>")`
- Plugins implement `MainPlugin` from `core/plugin/types.ts`
- All oRPC handlers receive `AppContext` (defined in `router.ts`)
- Tests colocated in `__tests__/` directories, run with vitest
- Entry point: `index.ts` — creates stores, plugins, oRPC handler
