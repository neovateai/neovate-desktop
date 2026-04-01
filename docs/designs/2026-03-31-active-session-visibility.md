# Active Session Visibility in Session List

## 1. Background

The active session in the sidebar session list is not visually distinct enough from inactive sessions. The current styling uses `bg-accent/80 text-foreground`, which resolves to a ~3-5% overlay — nearly invisible in both light and dark themes.

## 2. Requirements Summary

**Goal:** Make the active session immediately distinguishable from inactive sessions at a glance.

**Scope:**

- In scope: Active session item styling in `SessionItem` component
- Out of scope: Hover states, animations, icon changes, layout changes

## 3. Acceptance Criteria

1. The active session item is immediately distinguishable from inactive items at a glance
2. The styling follows the established `bg-primary/10 text-primary` pattern used in settings menu
3. Both light and dark themes render the active state clearly
4. No regression in hover states, developer-mode borders, or other session item features

## 4. Problem Analysis

Current state: active items use `bg-accent/80 text-foreground` which is the same neutral background used by every hover/selected state in the app. For a "where you are now" indicator, this lacks semantic distinction.

- **Increase bg-accent opacity** — Would still look like a generic hover, no semantic meaning -> rejected
- **Left border accent** — Only one ad-hoc usage in the codebase (network-view.tsx, hard-coded hex) -> rejected as not established
- **`bg-primary/10 text-primary font-medium`** — Matches settings menu active state pattern (settings-menu.tsx:87), the closest architectural analog -> chosen

## 5. Decision Log

**1. Which active state pattern?**

- Options: A) Increase bg-accent opacity · B) bg-primary/10 text-primary (settings menu pattern) · C) Left border accent
- Decision: **B)** — Established precedent in settings-menu.tsx:87 for sidebar navigation active states

**2. Add font-medium?**

- Options: A) Yes, match settings menu exactly · B) No, keep current weight
- Decision: **B)** — Dropping font-medium avoids layout shift when swapping active sessions (text reflows at different weight). Color distinction alone is sufficient.

**3. Icon color inheritance?**

- Options: A) Let icons inherit text-primary via currentColor · B) Keep icons as-is
- Decision: **A)** — Natural CSS cascade; status indicators use explicit colors and are unaffected

## 6. Design

Single styling change in `session-item.tsx` line 142-144.

From:

```tsx
isActive
  ? "bg-accent/80 text-foreground"
  : "text-foreground/80 hover:bg-accent/50 hover:text-foreground";
```

To:

```tsx
isActive
  ? "bg-primary/10 text-primary"
  : "text-foreground/80 hover:bg-accent/50 hover:text-foreground";
```

The `text-primary` class cascades to child elements using `currentColor` (chat icon, pin icon), giving the active item a cohesive pink tint. The Spinner also inherits `text-primary` when the active session is streaming — this reinforces the active state and looks intentional. The turn-result `Circle` and `HelpCircleIcon` use explicit color classes and are unaffected.

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/session-item.tsx` — Update active session styling from `bg-accent/80 text-foreground` to `bg-primary/10 text-primary`

## 8. Verification

1. [AC1] Active session shows pink background tint + primary-colored text, visually distinct at a glance
2. [AC2] Compare with settings menu active item — should use matching pattern
3. [AC3] Toggle between light/dark themes, verify active state is clear in both
4. [AC4] Test hover, archive, pin/unpin, rename, developer-mode border — all still work
