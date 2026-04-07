# Design: Option-Hold Project Name Reveal in Chronological List

## What

When the user holds the **Option** key for >=80ms while viewing the **chronological session list**, each session item swaps the relative time (e.g. "2h ago") for the **project name** (last segment of `cwd`, e.g. "neovate-desktop-4"). Releasing Option reverts to the time display. The swap is instant (no animation) to match macOS Option-hold conventions (Finder, menu bar).

## Scope

- **Chronological view:** applies to both `ChronologicalList` and `PinnedSessionList`.
- **By-project view:** applies to `PinnedSessionList` only — pinned sessions sit above the project accordions and mix projects in both modes. Accordion items already show their project via the header.
- **Single-project mode:** not applicable (only one project).

## Implementation approach

1. **`useOptionHeld` hook** — listens to `keydown`/`keyup` for the Option key (Alt), with an **80ms** debounce before setting `true`. Returns a boolean. Cleans up on unmount and handles window blur (reset to `false`).
2. **Single hook consumer** — `useOptionHeld()` is called once at the list level (`ChronologicalList` / `PinnedSessionList`) and passed down as a prop. Not per-item — that avoids N listeners for the same global keydown event.
3. **Pass `optionHeld` + `projectName` to `SessionItem`** — Both `ChronologicalList` and `PinnedSessionList` derive the project name from each item's `projectPath` (last path segment via simple string split). Pass it as a prop.
4. **`SessionItem` swap** — when `projectName` is provided and `optionHeld` is true, render the project name in place of `relativeTime`. Swap is instant (no transition). No layout shift since both occupy the same flex slot with `truncate`.

## Project name derivation

- Extract last path segment: `/Users/cc/Projects/neovate-desktop-4` -> `neovate-desktop-4`
- Truncate with CSS `truncate` class if too long for the sidebar width.

## Edge cases

- **Window blur while Option held** -> reset to `false`
- **Option held before component mounts** -> no effect until next keydown cycle
- **Sessions without `cwd`** -> fall back to showing relative time even when Option held

## Key files

| Purpose              | Path                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| Chronological list   | `src/renderer/src/features/agent/components/chronological-list.tsx`  |
| Pinned session list  | `src/renderer/src/features/agent/components/pinned-session-list.tsx` |
| Session item         | `src/renderer/src/features/agent/components/session-item.tsx`        |
| Unified session hook | `src/renderer/src/features/agent/hooks/use-unified-sessions.ts`      |
| New hook (to create) | `src/renderer/src/hooks/use-option-held.ts`                          |
