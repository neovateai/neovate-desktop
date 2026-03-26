# Panel Trigger Button Group

## 1. Background

The `test-full-right-panel` button and `NewChatButton` in the sidebar need consistent styling (icon + text + hover) and should be grouped together as a reusable component. More panel trigger buttons will be added later.

## 2. Requirements Summary

**Goal:** Group sidebar action buttons (New Chat + panel triggers) into a single reusable `PanelTriggerGroup` component with consistent icon+text styling.

**Scope:**

- In scope: Extract buttons to shared component, unify styling, add icon to test button, move separator to group, add margin-bottom
- Out of scope: New buttons beyond the existing two

## 3. Acceptance Criteria

1. `NewChatButton` and `TestFullRightPanelButton` render inside a single `PanelTriggerGroup` component
2. Both buttons have the same pattern: 20x20 icon badge + label text + hover effect
3. `TestFullRightPanelButton` uses `PanelRight` icon (lucide-react)
4. Active state (panel open) shows `bg-accent text-accent-foreground` on button background only
5. Gradient separator sits at the bottom of the group (moved from inside NewChatButton)
6. Group has `mb-2.5` for spacing below
7. Both `MultiProjectSessionList` and `SingleProjectSessionList` use `PanelTriggerGroup`
8. `new-chat-button.tsx` is deleted

## 4. Decision Log

**1. Where to put the buttons?**

- Options: A) New `panel-trigger-buttons.tsx` file - B) Inline in `session-list.tsx` - C) Separate files per button
- Decision: **A)** — single file, one group component, easy to add more buttons later

**2. What to do with `new-chat-button.tsx`?**

- Options: A) Keep and import - B) Move content into new file, delete old
- Decision: **B)** — no reason to keep a separate file when the button lives in the group

**3. Separator placement?**

- Options: A) Bottom of group - B) Between NewChat and panel buttons - C) Remove entirely
- Decision: **A)** — separator between the whole group and the session list

**4. Active state highlight?**

- Options: A) Button background only - B) Button background + icon badge - C) Icon badge only
- Decision: **A)** — `bg-accent text-accent-foreground` on button, icon badge unchanged

## 5. Design

### Component: `PanelTriggerGroup`

**File:** `src/renderer/src/features/agent/components/panel-trigger-buttons.tsx`

**Props:** `{ projectPath?: string }`

**Renders:**

- `NewChatButton` — `SquarePen` icon, calls `createNewSession(projectPath)`, disabled when no project
- `TestFullRightPanelButton` — `PanelRight` icon, calls `openFullRightPanel("test")`, highlighted when active
- Gradient separator line
- Outer wrapper with `mb-2.5`

### Base component: `SidebarActionButton`

A shared base component in the same file. All buttons in the group use it — no className duplication.

**Props:**

- `icon: LucideIcon` — the icon component
- `label: string` — button text
- `onClick: () => void`
- `active?: boolean` — highlights button background
- `disabled?: boolean` — disables interaction

**Styling:**

- **Button:** `group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-all`
- **Icon badge:** `flex size-5 items-center justify-center rounded bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground`
- **Icons:** size 12, strokeWidth 2
- **Default state:** `text-foreground hover:bg-accent/50`
- **Active state:** `bg-accent text-accent-foreground`
- **Disabled state:** `disabled:pointer-events-none disabled:opacity-40`

Adding a future button is a one-liner: `<SidebarActionButton icon={X} label="..." onClick={...} />`

## 6. Files Changed

- `src/renderer/src/features/agent/components/panel-trigger-buttons.tsx` — new file, `PanelTriggerGroup` with both buttons
- `src/renderer/src/features/agent/components/new-chat-button.tsx` — deleted
- `src/renderer/src/features/agent/components/session-list.tsx` — replace `<NewChatButton>` + `<TestFullRightPanelButton>` with `<PanelTriggerGroup>`, update imports, remove inline `TestFullRightPanelButton`

## 7. Verification

1. [AC1] Both buttons visible inside the group in the sidebar
2. [AC2] Both buttons have icon badge + text with same dimensions and spacing
3. [AC3] Test button shows `PanelRight` icon
4. [AC4] Click test button -> button background highlights, icon badge unchanged
5. [AC5] Gradient separator renders at the bottom of the group
6. [AC6] Visual spacing between group and session list
7. [AC7] Works in both multi-project and single-project mode
8. [AC8] No `new-chat-button.tsx` file exists
