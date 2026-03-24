# Fix: Session Switch Overwritten by Auto-Create

## 1. Background

When clicking a session from another project in multi-project mode, the UI briefly shows the selected session then immediately replaces it with an empty/initial session. The user never sees the session they clicked.

## 2. Problem Analysis

Traced via dev.log. The sequence when clicking session `d8653355` from project "cc-skills":

```
08:34:55.744  setActiveSession: d8653355        <- user's click
08:34:55.861  effect[auto-create]: creating new session for cc-skills
08:34:55.861  createNewSession: reusing pre-warmed session 28137f26
08:34:55.862  setActiveSession: 28137f26        <- OVERWRITES user's selection
```

The click handler (`handleActivate`) synchronously calls:

1. `switchToProjectByPath(B)` — changes `activeProjectPath`
2. `setActiveSession(clickedId)` — sets the clicked session

React batches both, then runs effects. The `effect[auto-create]` in `agent-chat.tsx` fires because `activeProjectPath` changed. It passes the `initializedPathRef` guard (new project path) and calls `createNewSession()`, which finds a pre-warmed session and immediately overwrites `activeSessionId`.

- **Approach A** — Flag in store set by click handlers, checked in effect -> Works but requires changes in 4+ files (store, all list components, agent-chat)
- **Approach B** — Guard in `createNewSession` to skip if active session is in target project -> Breaks "New Chat" button which also calls `createNewSession`
- **Chosen approach** — Check store state in the effect itself -> Single-file change, reads batched state which already has the user's selection

## 3. Decision Log

**1. Where to add the guard?**

- Options: A) In `createNewSession` function B) In `effect[auto-create]` C) Flag in store
- Decision: **B) In `effect[auto-create]`** — Single-file change, the effect is the source of the unwanted call, and `useAgentStore.getState()` reads the already-batched state containing the user's selection

**2. How to detect "user already selected a session"?**

- Options: A) Check `activeSessionId`'s session cwd matches target project B) Boolean flag in store C) Check if `activeSessionId` changed since last render
- Decision: **A) Check cwd match** — No new store state needed. The user's clicked session has `cwd === activeProjectPath` because it belongs to that project. Also requires `!session.isNew` to exclude pre-warmed sessions.

**3. Handle persisted (on-disk) sessions?**

- Options: A) Also fix persisted path B) Fix only in-memory path
- Decision: **B) In-memory only** — Persisted sessions self-correct: `loadSession` eventually calls `createSession` which overwrites the auto-created session. The only artifact is a brief flash of the empty session, which is cosmetic and out of scope for this fix.

## 4. Design

In `agent-chat.tsx`, `effect[auto-create]` (lines 147-169), after the `initializedPathRef` guard, read the current store state. If the active session belongs to the target project and is not a pre-warmed empty session, skip auto-create:

```ts
const { activeSessionId: currentId, sessions: currentSessions } = useAgentStore.getState();
if (currentId) {
  const session = currentSessions.get(currentId);
  // In multi-project mode, switching via project selector keeps activeSessionId
  // pointing to the old project's session (cwd won't match), so auto-create
  // correctly proceeds for that case.
  if (session && session.cwd === activeProjectPath && !session.isNew) {
    chatLog("effect[auto-create]: skipping, active session %s already in project", currentId);
    initializedPathRef.current = activeProjectPath;
    return;
  }
}
```

Why this works:

- **User clicks in-memory session from project B**: `setActiveSession(clickedId)` runs synchronously, React batches it with the project switch. When the effect fires, `activeSessionId` points to the clicked session whose `cwd === projectB`. Guard triggers, skip.
- **User switches project via selector (no session click)**: `activeSessionId` still points to old project A's session. `cwd !== projectB`. Guard doesn't trigger, auto-create proceeds. Correct.
- **First load, no session**: `activeSessionId` is null. Guard doesn't trigger, auto-create proceeds. Correct.
- **Pre-warmed session active**: `session.isNew === true`. Guard doesn't trigger, auto-create proceeds (replaces with fresh session). Correct.

## 5. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/agent-chat.tsx` — Add guard in `effect[auto-create]` to skip when active session already belongs to target project

## 6. Verification

1. In multi-project mode, click a session from a different project in the sidebar -> should show that session's messages, NOT an empty session
2. Switch projects via any project selector -> should still auto-create an empty session for the new project
3. On first app load -> should auto-create an empty session for the initial project
4. Click "New Chat" while in a project -> should create a new empty session (unaffected, doesn't go through the effect)
