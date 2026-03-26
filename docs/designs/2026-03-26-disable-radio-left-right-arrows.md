# Disable Left/Right Arrow Keys in AskUserQuestion RadioGroup

## 1. Background

The `AskUserQuestionRequestDialog` uses `@base-ui/react`'s `RadioGroup` for single-select questions. By default, RadioGroup's internal `CompositeRoot` uses `orientation: "both"`, which means all four arrow keys (left/right/up/down) navigate between radio options. Left/right is unintuitive for a vertical radio list and can accidentally switch selections.

## 2. Requirements Summary

**Goal:** Prevent left/right arrow keys from switching radio options in the AskUserQuestion dialog, while keeping up/down arrow navigation intact.

**Scope:**

- In scope: Single-select RadioGroup arrow key behavior in both `AskUserQuestionRequestDialog` and `ExitPlanModeRequestDialog`
- Out of scope: Multi-select (uses checkboxes, no arrow nav), up/down arrows, textarea cursor movement

## 3. Acceptance Criteria

1. Left/right arrow keys no longer switch between radio options
2. Up/down arrow keys still switch between radio options
3. Typing in the custom answer textarea still allows left/right cursor movement
4. `bun ready` passes

## 4. Problem Analysis

- **Root cause:** `CompositeRoot` (inside RadioGroup) defaults to `orientation: "both"`, treating ArrowLeft/ArrowRight as backward/forward navigation keys
- **CompositeRoot source:** `useCompositeRoot.js` lines 64-193 — the `onKeyDown` handler maps arrow keys to index changes
- **RadioGroup does not expose** an `orientation` prop to restrict to vertical-only

## 5. Decision Log

**1. How to intercept arrow keys?**

- Options: A) `onKeyDownCapture` with `stopPropagation` · B) `onKeyDown` with `event.preventBaseUIHandler()` · C) Wrap in a div with capture handler
- Decision: **B)** — base-ui's `mergeProps` supports `preventBaseUIHandler()` as an official API for user-provided event handlers to prevent internal handlers from running (`mergeProps.js:143-163`). Clean, no propagation side effects.

**2. Where to add the handler?**

- Options: A) On each `<Radio>` · B) On the `<RadioGroup>` · C) On a wrapper `<div>`
- Decision: **B)** — RadioGroup spreads user props as `elementProps`, which get merged via `mergePropsN` with CompositeRoot's internal `onKeyDown`. The user handler runs first (rightmost in merge order) and can prevent the internal one.

**3. Textarea cursor movement safety?**

- Our `preventBaseUIHandler()` call prevents CompositeRoot's `onKeyDown` from running entirely for ArrowLeft/ArrowRight, so the browser default handles cursor movement in the textarea. Note: without this fix, CompositeRoot's `isNativeInput` check would still allow navigation at cursor boundaries (position 0 or end of text), which is an additional reason the fix is needed.

## 6. Design

Add `onKeyDown` prop to the `<RadioGroup>` in `ask-user-question-request-dialog.tsx`. In the handler, call `event.preventBaseUIHandler()` for ArrowLeft and ArrowRight keys. This leverages base-ui's official event handler prevention API.

The merge chain in base-ui:

1. CompositeRoot's `onKeyDown` (internal navigation) is registered first (leftmost)
2. User's `onKeyDown` (our handler) is registered last (rightmost via `elementProps`)
3. `mergeEventHandlers` runs the rightmost handler first
4. If `preventBaseUIHandler()` is called, the internal handler is skipped

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/ask-user-question-request-dialog.tsx` — Add `onKeyDown` to RadioGroup
- `packages/desktop/src/renderer/src/features/agent/components/exit-plan-mode-request-dialog.tsx` — Add `onKeyDown` to RadioGroup

## 8. Verification

1. [AC1] Focus a radio option, press ArrowLeft/ArrowRight → selection does not change
2. [AC2] Focus a radio option, press ArrowUp/ArrowDown → selection changes normally
3. [AC3] Click into custom answer textarea, type text, use ArrowLeft/ArrowRight → cursor moves normally (including at cursor position 0 and end of text — boundary cases)
4. [AC4] `bun ready` passes
