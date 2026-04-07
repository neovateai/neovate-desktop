# Live Relative Time Updates in Session List

## 1. Background

The session list sidebar displays relative timestamps ("2m", "1h", "3d") next to each session. These are computed once via `useMemo(() => formatRelativeTime(createdAt), [createdAt])` in `SessionItem`. Because `createdAt` never changes, the displayed time becomes stale — a session created "2 minutes ago" continues showing "2m" indefinitely until the component re-renders for an unrelated reason.

## 2. Requirements Summary

**Goal:** Update each session's relative timestamp periodically so labels stay accurate as wall-clock time progresses. Ticks every 10 seconds so recent sessions ("0s" → "10s" → "1m") feel live; older items only re-render when their string actually changes.

**Scope:**

- In scope: A shared `useRelativeTime(iso)` hook; replacing the static `useMemo` in `SessionItem`
- Out of scope: Visibility-based pausing, changing which timestamp field is displayed, sort order changes, new dependencies

**Key Decisions:**

- Refresh strategy: Single shared hook with `useSyncExternalStore` + module-scoped 10s interval (avoids 50+ per-item timers, avoids wiring into 4 different list components). 10s keeps recent sessions feeling live; snapshot comparison prevents re-renders for items whose string hasn't changed.
- Sidebar visibility: Keep ticking regardless (SessionList is never unmounted; one 10s snapshot check is negligible)
- HMR safety: `import.meta.hot.dispose` cleans up leaked intervals on Vite hot reloads
- Wake refresh: `visibilitychange` listener forces an immediate tick when the window becomes visible (e.g., after laptop sleep/wake), so timestamps don't sit stale for up to 10s

## 3. Acceptance Criteria

1. A session label transitions from "0s" to "1m" to "2m" (etc.) without any user interaction, sidebar collapse/expand, or navigation
2. Exactly one `setInterval` runs at 10,000ms regardless of how many `SessionItem` components are mounted
3. Interval is ref-counted: created on first subscriber, cleared when the last subscriber unmounts (verified via unit test — in production SessionList is never unmounted)
4. `useSyncExternalStore` only triggers a re-render when the formatted string actually changes (e.g., "2m" becomes "3m"). Note: `getSnapshot` runs for all N subscribers on each tick to check, but the per-call cost is trivial.
5. Unit tests cover: format correctness, time advancement, and subscribe/unsubscribe lifecycle
6. Existing formatting preserved: short suffixes ("s", "m", "h", "d", "mo", "y") via `formatDistanceToNowStrict`
7. `bun ready` passes
8. No prop changes to `SessionItem` or `UnifiedSessionItem`

## 4. Problem Analysis

**Current state:** `formatRelativeTime(createdAt)` is wrapped in `useMemo` keyed on `createdAt`. Since `createdAt` is an immutable ISO string set at session creation, the memo never recomputes. The displayed time is effectively frozen at first-render value.

**Approaches evaluated:**

- **Per-item `setInterval`** — Each `SessionItem` runs its own timer. Rejected: up to 50+ concurrent intervals for a trivial task.
- **Parent-level timer** — A single timer in a parent list component forces re-render of all children. Rejected: session lists are spread across 4 components (`ChronologicalList`, `ProjectAccordionList`, `PinnedSessionList`, `SingleProjectSessionList`), making this awkward to wire.
- **Shared hook with `useSyncExternalStore`** — One module-scoped interval, each `SessionItem` subscribes individually. Chosen: minimal code, single interval, precise re-renders, no parent changes needed.

## 5. Decision Log

**1. Where to put the timer?**

- Options: A) Per-item `setInterval` · B) Parent-level timer · C) Shared hook with `useSyncExternalStore`
- Decision: **C)** — One interval regardless of item count; no changes to any list components

**2. Snapshot strategy for `useSyncExternalStore`?**

- Options: A) Return `tick` counter (all subscribers re-render every 60s) · B) Return formatted string (only re-render when string changes)
- Decision: **B)** — `Object.is` on strings compares by value, so React skips re-render when "2m" is still "2m"

**3. Pause when sidebar is collapsed?**

- Options: A) Yes, subscribe to layout store · B) No, always tick
- Decision: **B)** — SessionList is never unmounted (width:0 + overflow:hidden), and one 10s snapshot check is negligible

**5. Tick frequency?**

- Options: A) 60s (minute-level updates) · B) 10s (recent sessions feel live, snapshot comparison prevents unnecessary re-renders)
- Decision: **B)** — 10s keeps "0s" → "10s" → … → "1m" transitions visible for recent sessions. Older items ("3h", "3d") only re-render when their string changes (once per hour/day), so the faster tick costs nothing extra.

**6. HMR cleanup?**

- Options: A) Ignore (only affects development) · B) Use `import.meta.hot.dispose`
- Decision: **B)** — One line prevents leaked intervals accumulating during Vite hot reloads

**7. Refresh on wake from sleep?**

- Options: A) Wait for next tick (up to 10s stale) · B) `visibilitychange` listener forces immediate tick
- Decision: **B)** — After laptop sleep/wake, timestamps could be hours stale. One `addEventListener` ensures instant refresh when the user returns.

**4. Where does `formatRelativeTime` live?**

- Options: A) Keep in session-item.tsx · B) Move to the new hook module
- Decision: **B)** — Co-locates all time-formatting logic; callers just get a string back

## 6. Design

### New hook: `use-relative-time.ts`

A module-scoped subscription system with a single `setInterval`:

```ts
// packages/desktop/src/renderer/src/hooks/use-relative-time.ts
import { formatDistanceToNowStrict } from "date-fns";
import { useSyncExternalStore } from "react";

// Tick every 10s so recent sessions ("0s" → "10s" → … → "1m") feel live.
// Snapshot comparison means only items whose string changed re-render.
const TICK_INTERVAL_MS = 10_000;

const listeners = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function cleanup() {
  if (intervalId !== null) {
    clearInterval(intervalId);
    intervalId = null;
  }
  listeners.clear();
}

function notifyAll() {
  for (const listener of listeners) listener();
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  if (listeners.size === 1) {
    intervalId = setInterval(notifyAll, TICK_INTERVAL_MS);
  }
  return () => {
    listeners.delete(callback);
    if (listeners.size === 0) cleanup();
  };
}

// Refresh immediately on wake from sleep / tab-foreground so timestamps
// don't sit stale for up to TICK_INTERVAL_MS after the user returns.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && listeners.size > 0) {
      notifyAll();
    }
  });
}

// Clean up leaked intervals on Vite HMR
if (import.meta.hot) {
  import.meta.hot.dispose(cleanup);
}

export function formatRelativeTime(iso: string): string {
  const distance = formatDistanceToNowStrict(new Date(iso), { addSuffix: false });
  return distance
    .replace(/ seconds?/, "s")
    .replace(/ minutes?/, "m")
    .replace(/ hours?/, "h")
    .replace(/ days?/, "d")
    .replace(/ months?/, "mo")
    .replace(/ years?/, "y");
}

export function useRelativeTime(iso: string): string {
  return useSyncExternalStore(subscribe, () => formatRelativeTime(iso));
}
```

### Data flow

1. First `SessionItem` mounts → `useRelativeTime` calls `subscribe` → `listeners.size` goes from 0 to 1 → `setInterval` starts (10s)
2. Every 10s → interval fires → all listeners notified → React calls each component's `getSnapshot` (`formatRelativeTime(iso)`) → only components whose string changed re-render
3. Last `SessionItem` unmounts → `subscribe` cleanup runs → `listeners.size` drops to 0 → `cleanup()` clears interval
4. On wake from sleep → `visibilitychange` fires → `notifyAll()` → all snapshots re-evaluated → stale timestamps refresh instantly
5. On Vite HMR → `import.meta.hot.dispose` calls `cleanup()` → prevents leaked intervals from old module

### Changes to `SessionItem`

Replace the static `useMemo` with the new hook:

```diff
- import { formatDistanceToNowStrict } from "date-fns";
- import { memo, useMemo, useState } from "react";
+ import { memo, useState } from "react";
+ import { useRelativeTime } from "../../../hooks/use-relative-time";

- function formatRelativeTime(iso: string): string { ... }

  // Inside the component:
- const relativeTime = useMemo(() => formatRelativeTime(createdAt), [createdAt]);
+ const relativeTime = useRelativeTime(createdAt);
```

No changes to props, no changes to parent components, no changes to `UnifiedSessionItem`'s custom `arePropsEqual` (the hook is called inside `SessionItem`, below `UnifiedSessionItem`'s memo boundary — `createdAt` is still passed as an unchanged string prop).

## 7. Files Changed

- `packages/desktop/src/renderer/src/hooks/use-relative-time.ts` — New file: shared hook with module-scoped 10s interval, HMR cleanup, exports `useRelativeTime` and `formatRelativeTime`
- `packages/desktop/src/renderer/src/hooks/use-relative-time.test.ts` — New file: unit tests for format correctness, time advancement, and interval lifecycle
- `packages/desktop/src/renderer/src/features/agent/components/session-item.tsx` — Replace `useMemo` + local `formatRelativeTime` with `useRelativeTime` hook

## 8. Verification

1. [AC1] Open app, create a session, observe the timestamp label updating from "0s" to "1m" after ~60 seconds without any interaction
2. [AC2] Inspect via React DevTools or add a temporary `console.log` inside `subscribe` — only one interval is created
3. [AC3] Unit test: mount hook, verify interval starts; unmount all, verify interval clears
4. [AC4] With multiple sessions visible, observe that only items whose string changed re-render (React DevTools highlight)
5. [AC5] Unit test: `formatRelativeTime` returns correct short suffixes for known inputs
6. [AC6] Unit test: advance fake timers by 60s, verify formatted string updates
7. [AC7] Run `bun ready` — passes
8. [AC8] No TypeScript errors from changed/unchanged prop interfaces
