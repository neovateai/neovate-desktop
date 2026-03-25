# Fix Session Create Time for Pre-Warmed Sessions

## 1. Background

Sessions can be pre-warmed (created in background before the user needs them). The `createdAt` timestamp is set when the session is registered in the store, which happens at prewarm time — not when the user actually starts using the session. This causes incorrect relative time display and wrong sidebar sort order.

## 2. Requirements Summary

**Goal:** Make session `createdAt` reflect when the user actually starts using a session, not when it was pre-warmed.

**Scope:**

- In scope: Update `createdAt` in renderer store + persist to backend when `isNew` transitions to `false`
- Out of scope: `SessionInfo` type changes

## 3. Acceptance Criteria

1. A pre-warmed session shows "just now" when the user sends the first message
2. Sidebar sort order reflects actual usage start time, not prewarm time
3. Existing historical sessions (loaded from disk with `isNew=false`) are unaffected

## 4. Problem Analysis

- `createdAt` is set in `createSession` / `createBackgroundSession` via `new Date().toISOString()` at registration time
- `addUserMessage` sets `isNew = false` but does not update `createdAt`
- Both normal and pre-warmed flows have this issue

## 5. Decision Log

**1. Where to update createdAt?**

- Options: A) When `setActiveSession` activates a pre-warmed session · B) In `addUserMessage` when `isNew` transitions to `false`
- Decision: **B)** — `addUserMessage` is the definitive moment the session becomes "real". Activation alone doesn't mean the user will use it.

**2. Should we update createdAt unconditionally?**

- Options: A) Always update on first message · B) Only when `isNew` is currently `true`
- Decision: **B)** — Only update when transitioning from new to used. Restored sessions already have correct timestamps.

**3. Should we persist the corrected createdAt to survive app restarts?**

- Options: A) In-memory only · B) Persist via oRPC to ProjectStore
- Decision: **B)** — Store overrides in `sessionStartTimes` (ProjectStore). `listSessions` applies overrides before returning to the renderer.

## 6. Design

Two layers:

1. **Renderer (in-memory):** In `store.ts` `addUserMessage`, when `session.isNew` is `true`, update `session.createdAt` and sync to `agentSessions`. Fire-and-forget oRPC call to persist.
2. **Backend (persistence):** New `updateSessionStartTime` oRPC method stores the override in `ProjectStore.sessionStartTimes`. The `listSessions` handler applies these overrides to session birthtimes before returning.

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/agent/store.ts` — update `createdAt` + sync `agentSessions` + persist via oRPC in `addUserMessage`
- `packages/desktop/src/shared/features/project/types.ts` — add `sessionStartTimes` to `ProjectStore` schema
- `packages/desktop/src/shared/features/agent/contract.ts` — add `updateSessionStartTime` oRPC contract
- `packages/desktop/src/main/features/project/project-store.ts` — add `getSessionStartTimes`/`setSessionStartTime` methods
- `packages/desktop/src/main/features/agent/router.ts` — add handler + apply overrides in `listSessions`
- `packages/desktop/src/main/features/agent/__tests__/router.test.ts` — update mock context

## 8. Verification

1. [AC1] Pre-warm a session, wait, send first message — sidebar shows "just now"
2. [AC2] With multiple sessions, the newly-used session sorts to the top
3. [AC3] Load a historical session from disk — `createdAt` remains unchanged
