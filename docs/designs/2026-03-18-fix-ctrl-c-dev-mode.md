# Fix: Dev mode (bun dev) cannot exit with Ctrl-C

**Issue:** [#230](https://github.com/neovateai/neovate-desktop/issues/230)
**Date:** 2026-03-18

## Decision Log

**1. How to prevent the child shell from interfering with Ctrl-C?**

- Options: A) Remove `-i` flag · B) Add `detached: true` to spawn · C) Both
- Decision: **B) `detached: true`** — Puts the child in its own process group so SIGINT never reaches it. Keeps `-i` for complete env resolution (`.zshrc`/`.bashrc`).

**2. Should we `unref()` the child?**

- Options: A) Yes · B) No
- Decision: **A) Yes** — Electron keeps the event loop alive independently, so `unref()` won't cause premature exit but ensures the child doesn't block graceful shutdown.

## Root Cause

`shellEnvService.getEnv()` (called eagerly in `index.ts:32`) spawns a child shell with `-i -l -c` flags. The `-i` (interactive) flag causes the shell to set up job control in the parent's process group, interfering with terminal SIGINT delivery. When the user presses Ctrl-C, the signal doesn't reach the electron-vite dev server properly.

## Fix

Add `detached: true` to the `spawn()` call in `resolveShellEnv()` to put the child in its own process group, and call `child.unref()` so the child doesn't prevent process exit.

**File:** `packages/desktop/src/main/core/shell-service.ts`

Two-line change in the `spawn` call and after it.
