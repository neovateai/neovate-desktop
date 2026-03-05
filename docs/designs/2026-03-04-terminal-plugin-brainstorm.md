# Terminal Plugin Brainstorm

**Date:** 2026-03-04
**Status:** Ready for planning

---

## What We're Building

A fully functional terminal plugin for the content panel. Each tab spawns an independent PTY process (via `node-pty` in the main process) and renders it using `xterm.js` + `@xterm/addon-fit` in the renderer. Communication between main and renderer uses the existing oRPC plugin router pattern, with async generators for PTY output streaming.

## Why This Approach

- **Follows existing plugin patterns exactly** — modeled after the git plugin (untyped router via `ctx.orpcServer`), no new infrastructure needed
- **oRPC async generators for streaming** — keeps all communication in a single channel (the existing MessagePort transport); no separate IPC event wiring
- **`singleton: false`** — multiple terminal tabs are already supported by the content panel; each gets its own `instanceId`
- **`deactivation: "hidden"`** — inactive tabs get `display: none`, so xterm's DOM and scroll buffer survive tab switching without a ring buffer

---

## Key Decisions

### Plugin Structure

- **Main plugin** (`builtin:terminal`): registers `node-pty` PTY management + oRPC router
- **Renderer plugin** (`builtin:terminal`): contributes `ContentPanelView` with `singleton: false`
- PTY instances tracked in a `Map<instanceId, { pty, queue }>` on the main side

### oRPC Procedures (untyped plugin router)

| Procedure         | Input                       | Output                  | Description                                  |
| ----------------- | --------------------------- | ----------------------- | -------------------------------------------- |
| `terminal.spawn`  | `{ cwd?, cols, rows }`      | `{ sessionId }`         | Spawn a PTY; main generates UUID session key |
| `terminal.write`  | `{ sessionId, data }`       | `void`                  | Send keystrokes/input to PTY                 |
| `terminal.resize` | `{ sessionId, cols, rows }` | `void`                  | Notify PTY of terminal resize                |
| `terminal.stream` | `{ sessionId }`             | `AsyncIterable<string>` | Yields PTY output chunks                     |
| `terminal.kill`   | `{ sessionId }`             | `void`                  | Kill PTY and clean up                        |

Main stores PTY instances in `Map<sessionId, { pty, queue }>`. Renderer holds `sessionId` in React state.

### Push-to-Pull Bridge

PTY emits data via events (push). oRPC generators consume via pull. Bridge pattern:

```ts
class AsyncQueue<T> {
  push(chunk: T): void; // called by pty.onData
  iter(): AsyncIterable<T>; // consumed by oRPC generator
}
```

Each PTY instance gets its own `AsyncQueue<string>`.

### Terminal Lifecycle

1. Tab opens → renderer mounts xterm, calls `terminal.spawn({ cols, rows })` → gets `sessionId`
2. Renderer subscribes to `terminal.stream({ sessionId })` → async generator loop → `xterm.write(chunk)`
3. User types → `terminal.write({ sessionId, data })`
4. xterm resize event → `terminal.resize({ sessionId, cols, rows })`
5. Tab unmounts → `terminal.kill({ sessionId })` → PTY cleaned up from Map

### State Persistence

- No output buffer needed — `deactivation: "hidden"` keeps xterm alive in DOM between tab switches
- `{ cwd, shell }` persistence deferred post-MVP

### Dependencies

- `node-pty` — main process only (native Node addon, prebuilt for Electron)
- `xterm` + `@xterm/addon-fit` — renderer process

### Shell Selection

- Default: system default shell (`process.env.SHELL` on macOS/Linux, `powershell.exe` on Windows)

---

## File Plan

```
packages/desktop/src/main/plugins/terminal/
  index.ts          ← MainPlugin (activate, configContributions)
  router.ts         ← oRPC router (spawn, write, resize, stream, kill)
  pty-manager.ts    ← PTY Map + AsyncQueue

packages/desktop/src/renderer/src/plugins/terminal/
  index.tsx         ← RendererPlugin (already stubbed: ContentPanelView contribution)
  terminal-view.tsx ← Full implementation (xterm + addon-fit + oRPC client)
```

Bootstrap wiring:

- `packages/desktop/src/main/index.ts` — add `terminalPlugin` to `MainApp({ plugins })`
- Renderer plugin stub exists; verify registration in renderer bootstrap

---

## Open Questions

_None — all key decisions resolved._

---

## Resolved Questions

- **Streaming approach:** oRPC async generators (not hybrid IPC events)
- **Ring buffer:** Not needed for v1 — `deactivation: "hidden"` preserves xterm state
- **Contract typing:** Untyped plugin router (follows git plugin pattern, no `shared/contract.ts` changes)
