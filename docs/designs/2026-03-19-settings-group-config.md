# Settings: Visual Group Config (Card-based Sections)

**Date:** 2026-03-19
**Status:** Draft

## Problem

Settings panels (General, Chat) render a flat list of `SettingsRow` items with no visual grouping. Related settings (e.g., theme + language, terminal font + size) are mixed together without clear sections, making panels harder to scan as they grow.

## Solution

Add a reusable `SettingsGroup` card component that wraps `SettingsRow` items into visually distinct sections. Apply it to General and Chat panels with logical groupings.

## Component: `SettingsGroup`

**File:** `src/renderer/src/features/settings/components/settings-group.tsx`

```tsx
interface SettingsGroupProps {
  title: string;
  description?: string;
  children: ReactNode; // SettingsRow items
}
```

**Visual:** Rounded card (`rounded-[0.625rem]` per design system) with subtle `border border-border`, internal padding, and a group title rendered as a small semibold label at the top. Groups separated by `space-y-4` gap.

`SettingsRow` already has `border-b border-border last:border-b-0` which works perfectly inside a card container -- no changes needed to `SettingsRow`.

## Panel Groupings

### General Panel

| Group          | Settings                                              |
| -------------- | ----------------------------------------------------- |
| **Appearance** | Language, Theme                                       |
| **Terminal**   | Font Size, Font                                       |
| **Advanced**   | Run on Startup, Multi-Project Support, Developer Mode |

### Chat Panel

| Group        | Settings                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------- |
| **Model**    | Model selection                                                                           |
| **Behavior** | Agent Language, Permission Mode, Token Optimization, Network Inspector, Send Message With |

### Other Panels

Keybindings, Skills, Providers, Rules, About are single-purpose and don't need sub-groups now. The `SettingsGroup` component is available for them when needed.

## Changes

### 1. `src/renderer/src/features/settings/components/settings-group.tsx` (new)

New `SettingsGroup` card component:

- Rounded card with border
- Title as small semibold text at top
- Optional description below title
- Children rendered inside the card

### 2. `src/renderer/src/features/settings/components/panels/general-panel.tsx`

- Replace `<div className="space-y-0">` with `<div className="space-y-4">`
- Wrap rows in 3 `SettingsGroup` cards: Appearance, Terminal, Advanced

### 3. `src/renderer/src/features/settings/components/panels/chat-panel.tsx`

- Replace `<div className="space-y-0">` with `<div className="space-y-4">`
- Wrap rows in 2 `SettingsGroup` cards: Model, Behavior

### 4. i18n translation files

Add group title keys:

- `settings.general.group.appearance`
- `settings.general.group.terminal`
- `settings.general.group.advanced`
- `settings.chat.group.model`
- `settings.chat.group.behavior`

## Not Changed

- `SettingsRow` -- existing border styling works inside cards as-is
- `AppConfig` / config store -- no backend changes, purely UI
- Other panels -- available for future use but not modified now
