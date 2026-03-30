# Fix MaxListenersExceededWarning

## 1. Background

Users see `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. 11 exit listeners added to [process]` during normal usage. This fires after creating ~11 sessions across project switches.

## 2. Requirements Summary

**Goal:** Eliminate the MaxListenersExceededWarning and prevent unbounded session accumulation.

**Scope:**

- In scope: Bump process listener limit, close stale sessions on project switch
- Out of scope: Changes to `@anthropic-ai/claude-agent-sdk` internals

## 3. Acceptance Criteria

1. MaxListenersExceededWarning no longer fires during normal usage (multiple project switches)
2. Old sessions from previous projects are closed when switching projects (single-project mode)
3. No regression in session management (loading old sessions, multi-project mode)

## 4. Problem Analysis

Each `query()` from `@anthropic-ai/claude-agent-sdk` creates a `ProcessTransport` that registers `process.on("exit", handler)` to kill the child process on app exit. This is correct behavior.

The leak: when the user switches projects, a new session is created via `createNewSession()` but old sessions are never closed:

- `chat-manager.chats` Map grows unbounded (renderer)
- `sessionManager.sessions` Map grows unbounded (main process)
- Each session holds a `process.on("exit")` listener

`chat-manager.removeSession()` properly closes sessions (calls `dispose()`, `closeSession()` on main), but it's never called during project switches.

## 5. Decision Log

**1. How to prevent the warning?**

- Options: A) Bump `process.setMaxListeners()` - B) Remove SDK listeners manually
- Decision: **A)** - SDK exit listeners are legitimate; bumping the limit is the correct approach

**2. Where to close stale sessions?**

- Options: A) Chat-manager `closeAllSessions()` called on project switch - B) Session-manager auto-close on idle timeout - C) Renderer store cleanup
- Decision: **A)** - Simplest, most direct. Chat-manager already has `removeSession()` which handles full cleanup chain

**3. Should multi-project mode close sessions?**

- Options: A) Close all on switch - B) Only close in single-project mode
- Decision: **B)** - Multi-project mode intentionally keeps sessions from multiple projects alive

## 6. Design

### Part 1: Bump `process.setMaxListeners()` in `index.ts`

Add `process.setMaxListeners(50)` early in the main process entry point. This accommodates ~48 concurrent sessions (with 2 existing listeners for uncaughtException/unhandledRejection). Defense-in-depth.

### Part 2: Close stale sessions on project switch

Add `closeAllSessions()` to `ClaudeCodeChatManager`:

- Iterates all chats and calls `removeSession()` on each
- `removeSession()` already handles: `chat.stop()`, `chat.dispose()`, RPC `closeSession()`, cleanup

Call from the project-switch effect in `agent-chat.tsx`:

- Only in single-project mode (`!multiProjectSupport`)
- Before creating the new session

## 7. Files Changed

- `packages/desktop/src/main/index.ts` - Add `process.setMaxListeners(50)`
- `packages/desktop/src/renderer/src/features/agent/chat-manager.ts` - Add `closeAllSessions()` method
- `packages/desktop/src/renderer/src/features/agent/components/agent-chat.tsx` - Call `closeAllSessions()` on project switch

## 8. Verification

1. [AC1] Start app, switch between 3+ projects multiple times - no MaxListenersExceededWarning in logs
2. [AC2] After switching projects, verify old sessions are closed (check debug panel or main process logs)
3. [AC3] Load an old session from sidebar - should still work. Multi-project mode sessions persist across switches.
