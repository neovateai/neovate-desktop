# Unified File Logging

## Summary

Track all logs (main + renderer) to `~/.neovate-desktop/logs/` using `electron-log`, with daily rotation and 7-day retention.

## Decisions

- **Library**: `electron-log`
- **Dev mode**: log to `/tmp/dev.log`, truncated on every app start (clean slate each run)
- **Production mode**: log to `~/.neovate-desktop/logs/YYYY-MM-DD.log`, daily rotation, 7-day retention, 500MB max file size guard (stop writing if exceeded)
- **Mode detection**: `@electron-toolkit/utils` `is.dev`
- **Console override**: `electron-log` overrides `console.*` in both main and renderer — all existing call sites captured automatically
- **Debug package**: main-side — monkey-patch `debug.log` to route through `electron-log`. Renderer-side — call `debug.enable("neovate:*")` to force-enable all namespaces (browser `debug` is no-op unless enabled via `localStorage.debug`), then output flows through `console.debug` which is captured by the console override
- **Renderer transport**: renderer logs forwarded to main via IPC (electron-log built-in), written to the same unified log file
- **Existing code**: zero changes to existing `debug()` or `console.*` call sites

## Log Format

```
[2026-03-15 14:23:01.123] [info]  [main] Starting app...
[2026-03-15 14:23:01.456] [debug] [main] neovate:session-manager session created
[2026-03-15 14:23:01.789] [error] [renderer] Failed to load file tree: ...
```

## Files to Add

### `packages/desktop/src/main/core/logger.ts`

- Initialize `electron-log`
- Configure file transport based on mode:
  - **Dev**: `resolvePathFn` returns `/tmp/dev.log`, truncate file on init
  - **Production**: `resolvePathFn` returns `~/.neovate-desktop/logs/YYYY-MM-DD.log`
  - Log format: `[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}`
- Override `console.*` via `electron-log` (object.assign to console)
- Monkey-patch `debug.log` to pipe output through `electron-log.debug()`, stripping ANSI escape codes (`/\x1b\[[0-9;]*m/g`) before writing
- **Production only**: on init, scan `~/.neovate-desktop/logs/` and delete `.log` files older than 7 days
- **Production only**: check file size before each write; if current day's log exceeds 500MB, write a final warning (`Log file size limit (500MB) reached, logging suspended until tomorrow`) and stop writing for the rest of the day
- Export the logger instance

### `packages/desktop/src/renderer/src/core/logger.ts`

- Initialize `electron-log/renderer`
- Override `console.*` in renderer process
- Call `debug.enable("neovate:*")` to force-enable all neovate debug namespaces — ensures `debug()` calls produce output regardless of `localStorage.debug` setting

## Files to Modify

### `packages/desktop/src/main/index.ts`

- Add `import "./core/logger"` as the **first import** (before anything else) so all subsequent logging is captured

### `packages/desktop/src/preload/index.ts`

- Add `import "electron-log/preload"` to enable renderer-to-main IPC log forwarding

### `packages/desktop/src/renderer/src/main.tsx` (or equivalent entry)

- Add `import "./core/logger"` as the first import

## Dependencies

- Add `electron-log` to `packages/desktop/package.json` dependencies

## What Stays the Same

- All ~30 `debug("neovate:*")` call sites — untouched
- All ~60 `console.*` call sites — untouched
- `DEBUG=neovate:*` still works in terminal during development
