# Full Right Panel

## 1. Background

Need a mechanism to open a full-width panel to the right of the sidebar that covers the chat panel, content panel, secondary sidebar, and activity bar. This is a generic system that supports multiple panel types, each triggered by its own button in the sidebar.

## 2. Requirements Summary

**Goal:** Add a generic full-right-panel system, with a `test-full-right-panel` button in the sidebar as the first consumer.

**Scope:**

- In scope: state management, overlay component, test button, close-on-navigation behavior
- Out of scope: content injection API, additional panel types (future work)

**Key Decisions:**

- Panel ID model: `fullRightPanelId: string | null` — one panel open at a time
- Overlay approach — no changes to grid/panel system
- No animation — instant show/hide
- Button is one-way open (does not toggle closed)
- Panel closes on navigation (new chat, session click)
- Button background highlighted when panel is open
- Not persisted — always starts closed on app launch

## 3. Acceptance Criteria

1. A `test-full-right-panel` button appears below "New Chat" in the sidebar
2. Clicking it opens a panel covering everything to the right of the sidebar
3. Only the sidebar and the full right panel are visible when open
4. Underlying panels (chat, content, secondary sidebar) remain mounted (not unmounted)
5. The button has a highlighted background when the panel is open
6. Clicking "New Chat" closes the panel
7. Clicking a session item in the session list closes the panel
8. The panel displays placeholder content for now
9. No transition animation
10. Panel state is not persisted — starts closed on launch

## 4. Decision Log

**1. How to render the panel?**

- Options: A) Overlay (absolute positioning over existing panels) - B) Grid area replacement - C) Collapse all middle panels
- Decision: **A) Overlay** — a grid child that spans from the sidebar separator through activityBar using `grid-column: 2 / -1`. No changes to panel descriptors, types, or layout coordinator. Least invasive, same visual result.

**2. State model?**

- Options: A) Boolean toggle - B) String ID (supports multiple panel types)
- Decision: **B) String ID** (`fullRightPanelId: string | null`) — generic, supports future panel types with one button each.

**3. How to close the panel?**

- Options: A) Toggle button - B) Navigation actions only - C) Both
- Decision: **B) Navigation actions only** — button is one-way open. Closes on new chat or session click.

**4. Animation?**

- Options: A) Spring animation - B) None
- Decision: **B) None** — instant show/hide.

**5. Persist state?**

- Options: A) Yes, in localStorage - B) No
- Decision: **B) No** — always starts closed on app launch.

## 5. Design

### State

Add to layout store (`store.ts`):

```ts
fullRightPanelId: string | null   // null = closed, string = which panel is open
openFullRightPanel: (id: string) => void
closeFullRightPanel: () => void
```

Excluded from the `partialize` function so it's not persisted.

### Overlay Component

New file: `src/renderer/src/components/app-layout/full-right-panel.tsx`

- A grid child of `AppLayoutRoot` (not absolutely positioned)
- Uses `grid-column: 2 / -1` and `grid-row: 1 / -1` to span from the primarySidebar:chatPanel separator through the activityBar column, across both rows (covers the separator to avoid a visible gap)
- High `z-index` to layer above all covered panels, separators, and activity bar
- Renders placeholder content keyed by `fullRightPanelId`
- Returns `null` when `fullRightPanelId` is `null`
- No manual position calculation — the grid handles alignment with the sidebar automatically

### Button

In `session-list.tsx`, add `TestFullRightPanelButton` after `NewChatButton`:

- Full-width, similar height to New Chat button
- Calls `openFullRightPanel("test")` on click
- Background highlighted when `fullRightPanelId === "test"`

### Close Triggers

- `use-new-session.ts` — call `closeFullRightPanel()` when creating a new session
- Session item click handler — call `closeFullRightPanel()` when selecting a session

## 6. Files Changed

- `src/renderer/src/components/app-layout/store.ts` — add `fullRightPanelId`, `openFullRightPanel()`, `closeFullRightPanel()`, exclude from persistence
- `src/renderer/src/components/app-layout/full-right-panel.tsx` — new file, overlay component
- `src/renderer/src/App.tsx` — render `<FullRightPanel />` inside `AppLayoutRoot`
- `src/renderer/src/features/agent/components/session-list.tsx` — add test button below New Chat
- `src/renderer/src/features/agent/hooks/use-new-session.ts` — call `closeFullRightPanel()` on new chat
- Session item click handler — call `closeFullRightPanel()` on session selection

## 7. Verification

1. [AC1] `test-full-right-panel` button visible below "New Chat" in sidebar
2. [AC2-3] Click button -> panel covers chat/content/secondary/activity bar area
3. [AC4] Inspect DOM -> chat panel, content panel, secondary sidebar elements still present
4. [AC5] Button has highlighted background while panel is open
5. [AC6] Click "New Chat" -> panel closes
6. [AC7] Click session item -> panel closes
7. [AC8] Panel shows placeholder text
8. [AC9] No animation on open/close
9. [AC10] Refresh page -> panel is closed
