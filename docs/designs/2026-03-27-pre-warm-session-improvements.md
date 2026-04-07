# Pre-Warm Session Improvements

## 1. Background

The pre-warm feature creates background sessions so "New Chat" activates instantly without waiting for SDK initialization. Currently, `preWarmSession` is defined in `use-new-session.ts` but never called — it's dead code. When a pre-warmed session is consumed (first message sent), no replacement is created. There's also no user-facing config to control this behavior.

## 2. Requirements Summary

**Goal:** Auto-re-pre-warm sessions after consumption and add a config toggle.

**Scope:**

- In scope: Trigger background pre-warm on first message; add `preWarmSessions` config; add Settings > Chat toggle
- Out of scope: Multi-project pre-warming; initial pre-warm on app start (handled by `effect[auto-create]`)

## 3. Acceptance Criteria

1. When a user sends the first message in a pre-warmed session and `preWarmSessions` is enabled, a new background session is pre-warmed for the same project
2. Settings > Chat > Behavior shows a "Pre-warm Sessions" toggle
3. When toggle is OFF, no re-pre-warming happens
4. Default value is ON (`true`)

## 4. Decision Log

**1. Where to trigger re-pre-warm?**

- Options: A) Inside `addUserMessage` store action · B) In `handleSend` in agent-chat.tsx · C) Via Zustand subscribe
- Decision: **B) In `handleSend`** — component already has access to `preWarmSession` via `useNewSession()` hook and knows the project path. Store actions shouldn't have side effects like session creation.

**2. Config key name and default?**

- Options: A) `preWarmSessions: true` · B) `sessionPreWarm: true` · C) `backgroundSessions: true`
- Decision: **A) `preWarmSessions: true`** — clear, matches existing naming pattern (camelCase booleans like `tokenOptimization`, `networkInspector`)

**3. Invalidate pre-warmed sessions when toggle turns OFF?**

- Options: A) Yes, call `invalidateNewSessions` · B) No, let them be reused naturally
- Decision: **B) No invalidation** — YAGNI. Existing pre-warmed sessions are harmless and will be consumed on next "New Chat". Avoids unnecessary complexity.

## 5. Design

### Trigger Flow

In `agent-chat.tsx`'s top-level `handleSend` (welcome panel state where `activeSession.isNew`):

1. This `handleSend` is only reachable when `activeSession.isNew` is true (rendering branch on line 229), so no `wasNew` check is needed
2. After sending, if `configStore.preWarmSessions` is true, fire-and-forget call `preWarmSession(activeProjectPath)` — no `await` to avoid blocking the send path
3. `preWarmSession` already handles dedup (skips if one exists) and error handling
4. Destructure `preWarmSession` from `useNewSession()` hook (currently only `createNewSession` is destructured)
5. Pass `activeProjectPath` (not `cwd` state which may lag during project switches)

Note: The initial session on app start is created via `effect[auto-create]` → `createNewSession`. Pre-warming benefit starts from the second "New Chat" onward.

### Config Pipeline

Add `preWarmSessions: boolean` through the full config stack:

- `AppConfig` type → `contract.ts` zod union → main `DEFAULT_APP_CONFIG` → renderer `DEFAULT_CONFIG`

### Settings UI

Add a Switch row in the "Behavior" group of `chat-panel.tsx`, following the same pattern as `keepAwake`/`tokenOptimization`.

## 6. Files Changed

- `src/shared/features/config/types.ts` — Add `preWarmSessions: boolean` to `AppConfig`
- `src/shared/features/config/contract.ts` — Add `preWarmSessions` to config.set union
- `src/main/features/config/config-store.ts` — Add default `preWarmSessions: true`
- `src/renderer/src/features/config/store.ts` — Add default `preWarmSessions: true`
- `src/renderer/src/features/settings/components/panels/chat-panel.tsx` — Add Switch toggle
- `src/renderer/src/features/agent/components/agent-chat.tsx` — Trigger pre-warm on first message
- `src/renderer/src/locales/en-US.json` — Add translation keys
- `src/renderer/src/locales/zh-CN.json` — Add translation keys

## 7. Verification

1. [AC1] Send first message in a session → check debug logs for `preWarmSession: creating background session`
2. [AC2] Open Settings > Chat > Behavior → verify "Pre-warm Sessions" toggle exists
3. [AC3] Toggle OFF → send first message → verify no background session created
4. [AC4] Fresh install → verify toggle defaults to ON
5. [Negative] Send second message in an active session → verify no duplicate pre-warm triggered (only the welcome-panel `handleSend` path triggers it)
