# Settings Restructure

> Reorganize settings categories, groups, and item placement. No item renames — purely structural.

## Current → New Categories

| Before      | After       | Notes                                                                    |
| ----------- | ----------- | ------------------------------------------------------------------------ |
| General     | **General** | Keeps name. Groups reorganized: Appearance, Terminal, System, Developer. |
| Chat        | **Agents**  | Renamed. Groups: Models, Behavior (merged with former Performance).      |
| Providers   | Providers   | Unchanged                                                                |
| Messaging   | Messaging   | Unchanged                                                                |
| Rules       | Rules       | Unchanged                                                                |
| Keybindings | Keybindings | Unchanged                                                                |
| About       | About       | Unchanged                                                                |

## Menu Order

1. General
2. Agents
3. Providers
4. Rules
5. Messaging
6. Keybindings
7. About

> Rules is placed right after Providers — both are "agent config" categories that users often configure together.

## Category Details

### 1. General (kept)

#### Group: Appearance

| Item          | Key           |
| ------------- | ------------- |
| Language      | `locale`      |
| Theme         | `theme`       |
| Color Theme   | `themeStyle`  |
| App Font Size | `appFontSize` |

#### Group: Terminal

| Item               | Key                |
| ------------------ | ------------------ |
| Terminal Font Size | `terminalFontSize` |
| Terminal Font      | `terminalFont`     |

#### Group: System

| Item                    | Key                                 |
| ----------------------- | ----------------------------------- |
| Run on Startup          | `runOnStartup`                      |
| Multi-Project Support   | `multiProjectSupport`               |
| Popup Window            | `popupWindowEnabled`                |
| Popup Window Shortcut   | `popupWindowShortcut` (conditional) |
| Popup Window: Stay Open | `popupWindowStayOpen` (conditional) |

#### Group: Developer (bottom of page)

| Item                     | Key                     | Moved from         |
| ------------------------ | ----------------------- | ------------------ |
| Developer Mode           | `developerMode`         | General > Advanced |
| Claude Code Binary       | `claudeCodeBinPath`     | General > Advanced |
| Show Session Init Status | `showSessionInitStatus` | General > Advanced |
| Network Inspector        | `networkInspector`      | Chat > Behavior    |
| NPM Registry             | `npmRegistry`           | General > Skills   |

### 2. Agents (was: Chat)

#### Group: Models

| Item            | Key                       |
| --------------- | ------------------------- |
| Model           | `globalModelSelection`    |
| Auxiliary Model | `auxiliaryModelSelection` |

#### Group: Behavior

User-facing preferences first, then engine settings:

| Item               | Key                 | Subgroup       |
| ------------------ | ------------------- | -------------- |
| Agent Language     | `agentLanguage`     | preferences    |
| Permission Mode    | `permissionMode`    | preferences    |
| Send Message       | `sendMessageWith`   | preferences    |
| Notification Sound | `notificationSound` | preferences    |
|                    |                     | _(visual gap)_ |
| Token Optimization | `tokenOptimization` | engine         |
| Keep Awake         | `keepAwake`         | engine         |
| Pre-warm Sessions  | `preWarmSessions`   | engine         |

### 3. Providers (unchanged)

Flat list of provider cards with add/edit/delete.

### 4. Rules (unchanged)

Single global rules editor with @file references.

### 5. Messaging (unchanged)

Dynamic platform cards with enable/token/test/pair.

### 6. Keybindings (unchanged)

Keybinding list with readonly + editable actions.

### 7. About (unchanged)

- Version / Check for Updates
- Claude Code SDK Version
- Feedback

## Excluded from settings panels

- `sidebarOrganize`, `sidebarSortBy` — configured directly from sidebar UI, not in settings

## Migration Plan

### No changes needed

- `AppConfig` type (`src/shared/features/config/types.ts`)
- Config store (`src/renderer/src/features/config/store.ts`)
- IPC contract (`src/shared/features/config/contract.ts`)
- Settings key names — all `settingsKey` values remain the same
- `about-panel.tsx` — unchanged

### Code changes

#### 1. `src/renderer/src/features/settings/store.ts`

- Update `SettingsMenuId` type: `"chat"` → `"agents"` (keep `"general"`)

#### 2. `src/renderer/src/features/settings/components/settings-menu.tsx`

- Update menu items: `"chat"` → `"agents"` (ID + label)
- Reorder: General, Agents, Providers, Rules, Messaging, Keybindings, About

#### 3. Panel files (`src/renderer/src/features/settings/components/panels/`)

- `general-panel.tsx`:
  - Rename group "Advanced" → "System" (remove developerMode, claudeCodeBinPath, showSessionInitStatus from it)
  - Remove group "Skills"
  - Add new group "Developer" at bottom (developerMode, claudeCodeBinPath, showSessionInitStatus, networkInspector, npmRegistry)
- Rename `chat-panel.tsx` → `agents-panel.tsx`:
  - Remove "Performance" group concept
  - Merge tokenOptimization, keepAwake, preWarmSessions into "Behavior" group
  - Remove networkInspector (moved to General > Developer)

#### 4. `src/renderer/src/features/settings/components/settings-content.tsx`

- Update panel routing: `"chat"` → `"agents"`, import `agents-panel` instead of `chat-panel`

#### 5. Locales (`src/renderer/src/locales/`)

- `en-US.json`:
  - `settings.chat` → `settings.agents` (category label)
  - `settings.chat.*` → `settings.agents.*` (all item keys under chat)
  - Update group keys: `settings.general.group.advanced` → `settings.general.group.system`
  - Remove `settings.general.group.skills`
  - Add `settings.general.group.developer`
  - Add `settings.agents.group.models`, `settings.agents.group.behavior`
- `zh-CN.json`: Same structure changes with Chinese translations
