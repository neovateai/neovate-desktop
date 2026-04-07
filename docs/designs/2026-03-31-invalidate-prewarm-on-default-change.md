# Invalidate Prewarmed Sessions on Model Default Change

## 1. Background

When users right-click the in-chat model selector and choose "Set as Project Default" or "Set as Global Default", the model preference is persisted but prewarmed sessions are not invalidated. This means the next "New Chat" may start with the old model until the stale prewarm is consumed and a fresh one is created.

The Settings panel's global model selector already handles this correctly by calling `invalidateNewSessions()` after changing the default.

## 2. Requirements Summary

**Goal:** Invalidate prewarmed sessions when the user sets a project or global default via the in-chat model selector context menu.

**Scope:**

- In scope: `handleScopeAction` in `input-toolbar.tsx` for "project" and "global" scopes
- Out of scope: Session-scoped changes, Settings panel (already correct)

## 3. Acceptance Criteria

1. After "Set as Project Default" via context menu, all prewarmed (`isNew`) sessions are destroyed and recreated with the new model
2. After "Set as Global Default" via context menu, all prewarmed (`isNew`) sessions are destroyed and recreated with the new model
3. "Clear Session Override" does NOT trigger prewarm invalidation
4. Existing Settings panel behavior remains unchanged

## 4. Problem Analysis

- **Current behavior:** `handleScopeAction("project"|"global")` calls `client.provider.setSelection()` or `client.agent.setModelSetting()` but never calls `claudeCodeChatManager.invalidateNewSessions()`
- **Settings panel behavior:** `GlobalModelSelect.handleSelect()` calls `claudeCodeChatManager.invalidateNewSessions(projectPath)` after `client.config.setGlobalModelSelection()` — this is the correct pattern
- **Chosen approach:** Add `invalidateNewSessions(sessionCwd)` call after persisting project/global defaults in `handleScopeAction`

## 5. Decision Log

**1. Where to call invalidateNewSessions?**

- Options: A) Inside the oRPC handler on main process · B) In the renderer after the oRPC call
- Decision: **B)** — Matches the existing pattern in `chat-panel.tsx:296`. The renderer already owns the chat manager and prewarm lifecycle.

**2. What cwd to pass?**

- Options: A) `sessionCwd` from the current session · B) `useProjectStore.getState().activeProject?.path`
- Decision: **B) `activeProject?.path`** — Consistent with the two existing call sites in `chat-panel.tsx:295` and `skills-panel.tsx:103`. Read inline via `getState()` to avoid closure/dependency issues.

**3. When to call invalidateNewSessions relative to the oRPC call?**

- Options: A) Fire-and-forget alongside the oRPC call · B) Chain after the oRPC call completes via `.then()`
- Decision: **B)** — The new prewarmed session reads model settings on init. If invalidation runs before the oRPC write completes, the recreated session could pick up the old default.

## 6. Design

Chain `claudeCodeChatManager.invalidateNewSessions()` after the oRPC persistence calls in `handleScopeAction` for "project" and "global" scopes. The "clear" branch (session override) is left unchanged.

The cwd is read inline from `useProjectStore.getState().activeProject?.path` (matching existing call sites). The invalidation is chained via `.then()` on the oRPC call to ensure the new default is persisted before the prewarmed session is recreated.

## 7. Files Changed

- `src/renderer/src/features/agent/components/input-toolbar.tsx` — Add `invalidateNewSessions(sessionCwd)` call in `handleScopeAction` for project/global scope

## 8. Verification

1. [AC1] Right-click model selector -> "Set as Project Default" -> observe prewarmed session destroyed and recreated (check debug logs `neovate:chat-manager`)
2. [AC2] Right-click model selector -> "Set as Global Default" -> observe prewarmed session destroyed and recreated
3. [AC3] Right-click model selector -> "Clear Session Override" -> observe NO prewarm invalidation
4. [AC4] Settings -> Chat -> change global model -> prewarm invalidation still works as before
