# Fix: Collapsible Groups Animate During Session Restore

## 1. Background

GitHub issue #292: When restoring a session (app launch or switching sessions), collapsible tool/reasoning groups briefly flash all content visible before collapsing, causing scrollbar reflow and scroll position jumps.

## 2. Requirements Summary

**Goal:** Collapsible groups should restore to their final (collapsed) state immediately without playing an animation sequence.

**Scope:**

- In scope: Fix the summary collapse initialization for restored messages
- Out of scope: Individual tool animations (already handled by `AnimatePresence initial={false}`), new features

## 3. Acceptance Criteria

1. Restored sessions display summary collapse groups immediately in collapsed state (no flash)
2. Live streaming behavior is unchanged (tools/reasoning animate open during streaming, auto-collapse after)
3. Scroll position remains stable during session restore
4. `bun ready` passes

## 4. Problem Analysis

The `useAssistantMessageSummaryCollapse` hook computes `collapseKind` (either `"restored"`, `"live"`, or `null`) from the message's `deliveryMode` metadata via `useMemo`. However, `collapseMode` state is always initialized to `"normal"`:

```ts
const [collapseMode, setCollapseMode] = useState<CollapseMode>("normal");
```

The correction to `"collapsed"` only happens in a `useEffect`, which fires AFTER the first paint:

```ts
useEffect(() => {
  if (collapseKind === "restored") {
    setCollapseMode("collapsed");
    setIsOpen(false);
  }
}, [collapseKind, collapseMode]);
```

This causes a visible frame where all tool/reasoning parts render fully before the effect collapses them. Specifically: `collapseMode === "normal"` means `isCollapsible` evaluates to `false` (line 239: `collapseMode !== "normal" && trailingMessage != null`), which causes `AssistantMessageParts` to bypass the `<Collapsible>` wrapper and render all parts directly visible (line 92-100 of `message-parts.tsx`).

**Chosen approach:** Initialize `collapseMode` correctly on first render by deriving it from `collapseKind`, which is already available from the `useMemo` that runs before the `useState`.

## 5. Decision Log

**1. Fix approach?**

- Options: A) Initialize useState from collapseKind - B) useLayoutEffect instead of useEffect - C) CSS visibility:hidden until effect runs
- Decision: **A)** -- Simplest, most correct. collapseKind is available from the first render. No extra hooks or CSS hacks needed.

**2. Also initialize isOpen from collapseKind?**

- Options: A) Yes - B) No
- Decision: **B)** -- isOpen already defaults to false, which is correct for both restored (collapsed) and normal (not yet triggered).

## 6. Design

One-line change in `useAssistantMessageSummaryCollapse`:

```ts
// Before
const [collapseMode, setCollapseMode] = useState<CollapseMode>("normal");

// After
const [collapseMode, setCollapseMode] = useState<CollapseMode>(
  collapseKind === "restored" ? "collapsed" : "normal",
);
```

The existing useEffect stays as-is and serves as the safety net for post-mount `collapseKind` transitions. For restored messages, the effect redundantly sets the same values on mount. For live messages, the initialization is "normal" and the effect handles the transition to "prepare" then "collapsed" correctly. The `useState` initializer only runs on mount; if `collapseKind` changes later (e.g., component reuse across sessions), the effect's reset branch (`collapseKind == null`) handles it.

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/use-assistant-message-summary-collapse.ts` -- initialize collapseMode from collapseKind

## 8. Verification

1. [AC1] Restore a session with multiple tool calls/reasoning blocks -- summary collapse groups appear immediately collapsed, no flash
2. [AC2] Start a new session and observe live streaming -- tools animate open during streaming and auto-collapse after completion
3. [AC3] Switch between sessions rapidly -- no scroll jumps or reflow
4. [AC4] `bun ready` passes
