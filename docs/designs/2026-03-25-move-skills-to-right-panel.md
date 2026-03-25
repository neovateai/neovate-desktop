# Move Skills Settings to Right Full Panel

## 1. Background

Skills management is currently buried as one of 7 tabs in the Settings page overlay. Moving it to the Right Full Panel makes it more accessible as a first-class panel alongside chat, accessible from the primary sidebar.

## 2. Requirements Summary

**Goal:** Relocate the Skills UI from the Settings page to the Right Full Panel, triggered by a sidebar button.

**Scope:**

- In scope: Remove skills tab from settings, add sidebar button, render skills in full right panel
- Out of scope: Redesigning skills UI, changing data model/IPC, adding other panels

## 3. Acceptance Criteria

1. Settings page no longer shows a "Skills" tab (6 tabs remain)
2. A Skills button (Wand2 icon) appears in PanelTriggerGroup in the primary sidebar
3. Clicking the Skills button opens the full right panel with the skills UI
4. Clicking it again closes the panel (toggle behavior)
5. Skill detail and add modals still function correctly from within the panel
6. `bun ready` passes

## 4. Decision Log

**1. How to render skills content in FullRightPanel?**

- Options: A) View registry with lazy loading · B) Direct conditional render by panel ID
- Decision: **B) Direct conditional** — Only one panel type, registry is YAGNI

**2. Should SkillsPanel be adapted for the panel context?**

- Options: A) Reuse as-is · B) Add close button header and scrolling container
- Decision: **B) Add close button + scroll** — Panel needs its own close mechanism and overflow handling

**3. Replace or keep test button in PanelTriggerGroup?**

- Options: A) Replace test button · B) Keep both
- Decision: **A) Replace** — Test button was a placeholder

**4. What icon for sidebar skills button?**

- Options: A) Wand2 (lucide-react) · B) @hugeicons icon
- Decision: **A) Wand2** — Consistent with existing PanelTriggerGroup icons

**5. Should SettingsMenuId type keep "skills"?**

- Options: A) Remove from type · B) Keep but hide
- Decision: **A) Remove** — Clean removal, no dead code

## 5. Design

- **FullRightPanel**: Replace placeholder with conditional rendering for `fullRightPanelId === "skills"`, wrapping SkillsPanel in a scrollable container with close button
- **PanelTriggerGroup**: Replace test button with Skills button using Wand2 icon and toggle behavior
- **Settings removal**: Remove "skills" from SettingsMenuId, menuItems, MENU_LABEL_KEYS, and settings-page.tsx conditional render

## 6. Files Changed

- `src/renderer/src/components/app-layout/full-right-panel.tsx` — render SkillsPanel with close button
- `src/renderer/src/features/agent/components/panel-trigger-buttons.tsx` — replace test button with Skills
- `src/renderer/src/features/settings/components/settings-menu.tsx` — remove skills menu item
- `src/renderer/src/features/settings/components/settings-page.tsx` — remove skills panel rendering
- `src/renderer/src/features/settings/store.ts` — remove "skills" from SettingsMenuId

## 7. Verification

1. [AC1] Open settings — verify only 6 tabs visible, no "Skills"
2. [AC2] Check primary sidebar — Skills button visible with Wand2 icon
3. [AC3] Click Skills button — full right panel opens with skills grid
4. [AC4] Click Skills button again — panel closes
5. [AC5] Click a skill card — detail modal appears above panel; click Add — add modal works
6. [AC6] Run `bun ready` — passes
