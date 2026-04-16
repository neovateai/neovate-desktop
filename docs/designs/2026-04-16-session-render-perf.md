# Session Rendering Performance Fix

**Date:** 2026-04-16
**Status:** Approved, ready to implement
**Approach:** A (Derived Stores + Virtualization), then B (Split Store) incrementally

## Problem

With 1100+ sessions, the renderer pegs CPU at 100% and typing in the message input lags badly.

### Root causes

1. **Store subscription cascades:** `SessionItem`, `MessageInput`, and `InputToolbar` subscribe to the global `sessions` Map via `useAgentStore((s) => s.sessions.get(id)?.field)`. Because immer's `enableMapSet()` creates a new Map proxy on every mutation, ALL subscribers are notified on every store change — even when their specific session/field didn't change.

2. **`unseenTurnResults` Map broadcasts:** When any session completes a turn, the immer-managed `unseenTurnResults` Map mutates, notifying all 50+ visible `UnifiedSessionItem` components.

3. **No list virtualization:** `ChronologicalList` renders 50 real DOM nodes (capped from 1100+). Each re-render touches all 50.

4. **Timer-driven re-renders:** `useRelativeTime` ticks every 10s, triggering snapshot checks on all 50+ `SessionItem`s, each with 7+ store selectors.

5. **Input toolbar during streaming:** `ConnectedModelSelect` has `hasMessages` selector that re-renders on every streaming message update, blocking the tiptap editor's main thread.

6. **`useStableSessions` is O(n) on every store mutation:** `sessionsMetaEqual()` in `use-unified-sessions.ts` iterates all 1100 sessions comparing 5 fields each (~5500 comparisons) on every store change, even unrelated ones like chat messages.

7. **`QueryStatus` 100ms tick during streaming:** `useQueryStatus` runs `setInterval` at 100ms for spinner animation — 10 state updates/second while a turn is active.

### Evidence

| Metric                                  | Value       |
| --------------------------------------- | ----------- |
| Total sessions                          | 1114        |
| Persisted sessions                      | 1655        |
| Session renders (8h prod run)           | 3,239       |
| `task queue exceeded deadline` warnings | up to 646ms |
| CPU (old instance, active sessions)     | 100.4%      |
| CPU (restart, idle, settled)            | ~20%        |
| CPU only high with sidebar visible      | confirmed   |

Dev log with same data (1114 sessions) shows identical render pattern — 398 session renders in 2 minutes. Dev "feels ok" only because the session was too short for cascading effects to compound.

## Design: Phase A (Derived Stores + Virtualization)

Changes ordered by priority. P0 items have the highest impact-to-effort ratio.

### 0. [P0] Don't mount session list when sidebar is collapsed

**Files:** `session-list.tsx` (modify)

The user confirmed CPU is only high when the sidebar is open. The cheapest possible fix: don't render session list components at all when collapsed. Zero subscriptions, zero DOM nodes, zero cost.

```tsx
// In MultiProjectSessionList:
const collapsed = useLayoutStore((s) => s.panels.primarySidebar.collapsed);
if (collapsed) return null;

// In SingleProjectSessionList: same pattern
```

When the sidebar re-opens, React mounts the components fresh. The `useFilteredSessions` hook recomputes once and the list renders.

**Sidebar re-open jank:** With 1100 sessions, the initial `useFilteredSessions` filter + sort is synchronous and could cause a visible stutter on re-open. If this is noticeable, wrap the mount in `startTransition` so React renders it non-blockingly:

```tsx
const collapsed = useLayoutStore((s) => s.panels.primarySidebar.collapsed);
const [deferred, setDeferred] = useState(collapsed);
useEffect(() => {
  if (collapsed) setDeferred(true);
  else startTransition(() => setDeferred(false));
}, [collapsed]);
if (deferred) return null;
```

Measure first — likely unnecessary, but the escape hatch is here if needed.

**Scroll position preservation:** When the list unmounts on collapse and remounts on expand, the user's scroll position is lost. Save `scrollTop` to a module-level variable (not state — no re-render needed) before unmount, restore on remount:

```tsx
let savedScrollTop = 0;

// Inside the list component:
const scrollRef = useRef<HTMLUListElement>(null);

// Save on unmount
useEffect(() => {
  const el = scrollRef.current;
  return () => {
    if (el) savedScrollTop = el.scrollTop;
  };
}, []);

// Restore on mount
useEffect(() => {
  if (scrollRef.current) scrollRef.current.scrollTop = savedScrollTop;
}, []);
```

**Impact:** Eliminates 100% of sidebar render cost when hidden. No architectural change.

### 1. [P0] New `useSessionMeta` hook

**File:** `src/renderer/src/features/agent/hooks/use-session-meta.ts` (new)

Single hook that extracts scalar session metadata with `shallow` equality from zustand, replacing 5-7 scattered `s.sessions.get(id)?.X` selectors.

```ts
import { shallow } from "zustand/shallow";
import { useAgentStore } from "../store";

export function useSessionMeta(sessionId: string | null) {
  return useAgentStore((s) => {
    if (!sessionId) return null;
    const session = s.sessions.get(sessionId);
    if (!session) return null;
    return {
      permissionMode: session.permissionMode,
      currentModel: session.currentModel,
      modelScope: session.modelScope,
      providerId: session.providerId,
      isNew: session.isNew,
      hasMessages: session.messages.length > 0,
    };
  }, shallow);
}
```

**Key detail:** `hasMessages` is a boolean, not the raw length. Adding message #2, #3, etc. during streaming doesn't change the boolean from `true` to `true`, so `shallow` equality prevents re-renders.

**Important:** This hook is for **singleton components only** (`MessageInput`, `ConnectedModelSelect`, `ConnectedPermissionModeSelect`). It creates an object with 6 fields and runs `shallow` on every store mutation — acceptable for 1-3 instances, but NOT for 50 `SessionItem`s. For `SessionItem`, pass data as props instead (see section 6).

**Consumers to migrate:**

- `MessageInput` (line 101-103): `permissionMode`
- `ConnectedModelSelect` (lines 339-344): `currentModel`, `modelScope`, `providerId`, `hasMessages`
- `ConnectedPermissionModeSelect` (line 196-197): `permissionMode`
- ~~`SessionItem` (line 59): `sessionIsNew`~~ → pass as prop instead (see section 6)

### 2. [P0] Per-key event emitter for `unseenTurnResults`

**File:** `src/renderer/src/features/agent/hooks/use-unseen-turn-result.ts` (new)

Extract turn results out of the immer-managed store into a per-key event emitter. This ensures `markTurnCompleted("abc")` only notifies the one `SessionItem` rendering session `abc`, not all 50.

A naive vanilla zustand store (`createStore`) would still broadcast to all subscribers via `setState`. Instead, use a per-key subscription pattern:

```ts
import { useCallback, useSyncExternalStore } from "react";
import type { TurnResult } from "../store";

const results = new Map<string, TurnResult>();
const listeners = new Map<string, Set<() => void>>();

function notify(sessionId: string) {
  const set = listeners.get(sessionId);
  if (set) for (const cb of set) cb();
}

export function markTurnCompleted(sessionId: string, result: TurnResult) {
  results.set(sessionId, result);
  notify(sessionId);
}

export function clearTurnResult(sessionId: string) {
  if (!results.has(sessionId)) return;
  results.delete(sessionId);
  notify(sessionId);
}

function subscribe(sessionId: string, cb: () => void): () => void {
  let set = listeners.get(sessionId);
  if (!set) {
    set = new Set();
    listeners.set(sessionId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
    if (set.size === 0) listeners.delete(sessionId);
  };
}

export function useUnseenTurnResult(sessionId: string): TurnResult | undefined {
  // useCallback ensures useSyncExternalStore doesn't unsubscribe/resubscribe
  // on every render — only when sessionId changes.
  const sub = useCallback((cb: () => void) => subscribe(sessionId, cb), [sessionId]);
  const snap = useCallback(() => results.get(sessionId), [sessionId]);
  return useSyncExternalStore(sub, snap);
}
```

**Migration in `store.ts`:**

- Remove `unseenTurnResults` from `AgentState`
- `markTurnCompleted` and `clearTurnResult` actions delegate to the new module
- `setActiveSession` calls `clearTurnResult` from the new module

**Consumer:** `UnifiedSessionItem` (line 35) switches to `useUnseenTurnResult(sessionId)`.

### 3. [P0] `sessionsMetaVersion` counter to avoid O(n) comparison

**File:** `src/renderer/src/features/agent/store.ts` (modify), `use-unified-sessions.ts` (modify)

**Problem:** `useStableSessions()` subscribes to `useAgentStore((s) => s.sessions)` and runs `sessionsMetaEqual()` on every store change — O(1100) comparisons of 5 fields each.

**Fix:** Add a `_sessionsMetaVersion` counter to the store. Increment it only in actions that change session metadata (not messages/streaming):

```ts
// In AgentState:
_sessionsMetaVersion: number;

// Increment in: createSession, removeSession, renameSession, setIsNew,
//               setCurrentModel, setModelScope, setProviderId, setPermissionMode,
//               setAgentSessions, appendAgentSession, removeAgentSession
// Do NOT increment in: addUserMessage, addAssistantMessage, setSessionUsage, task updates
```

Then `useStableSessions` becomes:

```ts
function useStableSessions(): Map<string, ChatSession> {
  const version = useAgentStore((s) => s._sessionsMetaVersion);
  const ref = useRef({ version: -1, sessions: new Map<string, ChatSession>() });
  if (ref.current.version !== version) {
    ref.current = { version, sessions: useAgentStore.getState().sessions };
  }
  return ref.current.sessions;
}
```

This replaces the O(n) `sessionsMetaEqual` comparison with an O(1) integer check on every store mutation.

### 4. [P1/defer?] Virtualize `ChronologicalList`

**File:** `src/renderer/src/features/agent/components/chronological-list.tsx` (modify)

**New dependency:** `@tanstack/react-virtual`

**Note:** After fixes #0-#3, the 50 visible `SessionItem`s will barely re-render at all (no streaming cascade, no turn broadcast, no O(n) comparison, unmounted when collapsed). Virtualization reduces 50 DOM nodes to ~20 — a 60% reduction on an already-cheap operation. It adds scroll complexity, potential visual glitches, and a new dependency. **Measure after shipping #0-#3 before committing to this.** If 50 idle DOM nodes aren't a problem, defer to Phase B.

Replace the flat `.map()` with `useVirtualizer`. Fixed item height ~36px, overscan 5.

```tsx
import { useVirtualizer } from "@tanstack/react-virtual";

// Inside ChronologicalList:
const parentRef = useRef<HTMLUListElement>(null);
const virtualizer = useVirtualizer({
  count: visibleItems.length,
  getScrollElement: () => parentRef.current,
  estimateSize: () => 36,
  overscan: 5,
});

return (
  <ul ref={parentRef} style={{ overflow: "auto", flex: 1 }}>
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((virtualRow) => {
        const item = visibleItems[virtualRow.index];
        const id = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
        return (
          <div
            key={id}
            style={{
              position: "absolute",
              top: 0,
              transform: `translateY(${virtualRow.start}px)`,
              width: "100%",
              height: virtualRow.size,
            }}
          >
            <UnifiedSessionItem ... />
          </div>
        );
      })}
    </div>
    {/* "Show more" button rendered outside the virtual list */}
  </ul>
);
```

**Scroll container:** The virtualizer needs to attach to a scrollable parent. Verify whether the sidebar provides an outer scroll wrapper. If the sidebar itself scrolls (containing `PinnedSessionList` + `ChronologicalList`), use `scrollMargin` on the virtualizer or make the virtualizer use a window-level scroll measurement. If `ChronologicalList` has its own scroll area, the snippet above works as-is.

**Skip for now:** `PinnedSessionList` (15 items). `ProjectSessions` (capped at 5).

### 5. [P1] Throttle `useRelativeTime`

**File:** `src/renderer/src/hooks/use-relative-time.ts` (modify)

Two changes:

1. Increase tick interval from 10s to 60s — "2m" vs "3m" difference is not meaningful
2. Use `requestIdleCallback` so the re-render batch doesn't block user input

```ts
const TICK_INTERVAL_MS = 60_000; // was 10_000

function notifyAll() {
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(() => {
      for (const listener of listeners) listener();
    });
  } else {
    for (const listener of listeners) listener();
  }
}
```

**Impact:** Reduces timer-driven re-render batches from 6/min to 1/min, scheduled during idle.

### 6. [P1] Pass `isNew` and `isPlayground` as props to `SessionItem`

**File:** `session-item.tsx` (modify), `unified-session-item.tsx` (modify)

Two store subscriptions inside `SessionItem` should become props:

**a) `isNew`:** `SessionItem` line 59 reads `useAgentStore((s) => s.sessions.get(sessionId)?.isNew)` — subscribes to the global sessions Map. But `UnifiedSessionItem` already has this data from the `item` prop:

```tsx
// In UnifiedSessionItem:
const isNew = item.kind === "memory" ? item.session.isNew : false;
<SessionItem isNew={isNew} ... />
```

Zero store subscriptions. The data is already available.

**b) `isPlayground`:** `SessionItem` line 68-70 runs `useProjectStore((s) => s.projects.find((p) => p.path === projectPath)?.id === PLAYGROUND_PROJECT_ID)` — a `.find()` across all projects, inside every `SessionItem`, on every project store change.

```tsx
// In UnifiedSessionItem:
const isPlayground = useProjectStore(
  (s) => s.projects.find((p) => p.path === item.projectPath)?.id === PLAYGROUND_PROJECT_ID,
);
<SessionItem isPlayground={isPlayground} ... />
```

This moves one store subscription from 50 `SessionItem` instances to their single `UnifiedSessionItem` parent.

**Combined effect:** Removes 2 store subscriptions × 50 items = 100 unnecessary subscriptions.

**Also update the `UnifiedSessionItem` memo comparator** (lines 69-81) to include `isNew` and `isPlayground` in the props comparison.

### 7. [P1] Fix `SingleProjectSessionList`

**File:** `src/renderer/src/features/agent/components/session-list.tsx` (modify)

`SingleProjectSessionList` (line 65) directly reads `useAgentStore((s) => s.sessions)` and iterates all sessions in a `useMemo`. Same O(n) problem as `useStableSessions`.

**Fix:** Use `useStableSessions()` (now backed by version counter) instead of raw `useAgentStore((s) => s.sessions)`. Or better: migrate to `useFilteredSessions()` which already uses `useStableSessions` under the hood, removing the duplicated filtering logic.

### 8. [P2] Verify `QueryStatus` isolation during streaming

**File:** `src/renderer/src/features/agent/components/query-status.tsx`, `message-input.tsx`

`useQueryStatus` runs a 100ms `setInterval` during active turns — 10 `setTick` calls/second. Verify that this only causes `QueryStatus` to re-render, not `MessageInput` or `InputToolbar`.

**Current structure:** `QueryStatus` is rendered as `{activeSessionId && <QueryStatus sessionId={activeSessionId} />}` inside `MessageInput`. Since `QueryStatus` manages its own state (`tick`, `phase`), its re-renders should NOT propagate to `MessageInput` — React re-renders children independently when only their internal state changes.

**Action:** Verify this assumption. If `MessageInput` does re-render during streaming (check with React DevTools Profiler), wrap `QueryStatus` output in `memo` or extract the ticker into a separate inner component.

### 9. [P2] Note: `useSessionChatStatus` in `UnifiedSessionItem` bypasses memo

`UnifiedSessionItem` line 34 calls `useSessionChatStatus(sessionId)` which uses `useSyncExternalStore` on the per-session chat store. The `memo` comparator on `UnifiedSessionItem` (lines 69-81) only prevents re-renders from **prop changes**. Hooks like `useSyncExternalStore` trigger re-renders from **within** the component, bypassing memo entirely.

During streaming, the active session's `UnifiedSessionItem` re-renders on every chat store update. This is acceptable — only 1 session is active at a time, and the re-render is needed to update the streaming indicator. For unloaded sessions (`chat` is undefined), the subscription is a noop.

No action needed — just documenting the behavior so it's not mistaken for a bug during profiling.

## Files changed summary

| #   | Pri | File                                  | Change                                                                                 |
| --- | --- | ------------------------------------- | -------------------------------------------------------------------------------------- |
| 0   | P0  | `components/session-list.tsx`         | Don't mount session list when sidebar collapsed (+ `startTransition` if re-open janks) |
| 1   | P0  | `hooks/use-session-meta.ts`           | **New** — single hook with `shallow` equality (**singletons only**, not SessionItem)   |
| 2   | P0  | `hooks/use-unseen-turn-result.ts`     | **New** — per-key event emitter with stable `useCallback` subscribe                    |
| 3   | P0  | `store.ts`                            | Remove `unseenTurnResults`, add `_sessionsMetaVersion` counter                         |
| 4   | P0  | `hooks/use-unified-sessions.ts`       | `useStableSessions` uses version counter instead of O(n) comparison                    |
| 5   | P1? | `components/chronological-list.tsx`   | Add `@tanstack/react-virtual` — **measure after #0-#3 first, may defer**               |
| 6   | P1  | `components/unified-session-item.tsx` | Use `useUnseenTurnResult`, compute `isPlayground` + `isNew`, pass as props             |
| 7   | P1  | `components/session-item.tsx`         | Accept `isNew` + `isPlayground` as props, remove 2 store subscriptions                 |
| 8   | P1  | `components/message-input.tsx`        | Use `useSessionMeta` for `permissionMode`                                              |
| 9   | P1  | `components/input-toolbar.tsx`        | `ConnectedModelSelect`/`ConnectedPermissionModeSelect`: use `useSessionMeta`           |
| 10  | P1  | `hooks/use-relative-time.ts`          | 10s → 60s tick, `requestIdleCallback`                                                  |
| 11  | P1  | `components/session-list.tsx`         | `SingleProjectSessionList`: use `useStableSessions`/`useFilteredSessions`              |
| 12  | P2  | `components/query-status.tsx`         | Verify 100ms tick doesn't cascade to parent                                            |
| 13  | —   | `package.json`                        | Add `@tanstack/react-virtual` (only if #5 ships)                                       |

## Expected impact

| Metric                                 | Before                       | After                                                                   |
| -------------------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| Sidebar cost when collapsed            | 50+ subscriptions active     | 0 (unmounted)                                                           |
| Sidebar re-renders during streaming    | ~50 per message              | 0 (only active session)                                                 |
| Sidebar re-renders on turn completion  | ~50 (all items)              | 1 (completed session only)                                              |
| `useStableSessions` comparison cost    | O(1100) per store mutation   | O(1) integer check                                                      |
| Store subscriptions in SessionItem     | 7+ per item × 50 = 350+      | 2 per item × 50 = 100 (just `useRelativeTime` + `useSessionChatStatus`) |
| DOM nodes in session list              | 50                           | 50 (or ~20 if virtualization ships)                                     |
| Timer re-render batches                | 6/min                        | 1/min, during idle                                                      |
| Input keystroke latency                | blocked by store cascades    | eliminated                                                              |
| `isPlayground` + `isNew` subscriptions | 100 (2 per SessionItem × 50) | 0 (props from parent)                                                   |

## Phase B (future): Split Store Architecture

When the codebase grows beyond what derived hooks can manage, split `useAgentStore` into:

1. `useSessionMetaStore` — sidebar data (`{title, createdAt, cwd, isNew, ...}`)
2. `useSessionChatStore` — messages, streaming, tasks, usage
3. `useSessionUiStore` — activeSessionId, isRewinding, ephemeral UI state

This is a larger refactor (~20 files) but provides inherent subscription isolation. Phase A's hooks will make this migration easier since consumers already use the derived hooks rather than raw store selectors.
