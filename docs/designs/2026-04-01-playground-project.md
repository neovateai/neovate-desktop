# Playground Project — Chat Without a Project

**Date**: 2026-04-01
**Status**: Approved

## Problem

Today, every session requires an active project with a filesystem path. When no project is open, the app shows a welcome screen with no chat input. Users who just want to ask a quick question or chat without a codebase context are blocked.

## Solution

Auto-create a **Playground** project at `~/.neovate-desktop/workspaces/playground/`. It's a real `Project` entry in `projects.json` identified by a stable well-known ID (`PLAYGROUND_PROJECT_ID = "playground"`). All existing session infrastructure (create, list, archive, pin, provider selection, pre-warming) works unchanged.

## Design Decisions

| Decision              | Choice                                                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Entry point           | Both: auto-ready on fresh install + "Quick Chat" button on welcome panel when projects exist but none is active               |
| Sidebar placement     | Mixed into normal timeline (not a separate section)                                                                           |
| Workspace model       | Single shared playground directory                                                                                            |
| Visual distinction    | Subtle icon badge on playground sessions                                                                                      |
| Auto-activate         | Only when no other projects exist (fresh install). If user has projects but none active, show project selector as today.      |
| Sidebar button        | No dedicated sidebar button. Access via: auto-activation, welcome panel "Quick Chat", or clicking Playground in project list. |
| Project list position | Last on creation, respects user reorder after                                                                                 |
| Keyboard shortcut     | `Cmd+Shift+N` — "New Quick Chat" (configurable in settings)                                                                   |

## Data Model

**No changes to the `Project` type.** Instead, use a stable well-known ID:

```typescript
// src/shared/features/project/constants.ts
export const PLAYGROUND_PROJECT_ID = "playground";
```

Identification is simply `project.id === PLAYGROUND_PROJECT_ID` — no flag needed. The stable ID means:

- Re-creation after corruption is idempotent (same ID, same path)
- No type/schema migration
- Simple checks everywhere

The playground is stored in `projects.json` like any other project. Directory: `APP_DATA_DIR/workspaces/playground/` (`~/.neovate-desktop/workspaces/playground/`).

## Main Process — Auto-creation

On app startup, the main process calls `ensurePlayground()`:

1. **Always** run `mkdirSync(PLAYGROUND_DIR, { recursive: true })` — ensures the directory exists even if manually deleted (cheap, idempotent)
2. Check if a project with `id === PLAYGROUND_PROJECT_ID` exists in `projects.json`
3. If not, add: `{ id: PLAYGROUND_PROJECT_ID, name: "Playground", path: PLAYGROUND_DIR, createdAt: now, lastAccessedAt: now }`

**`getActive()` fallback**: If `activeProjectId` is null AND no user projects exist (only the playground), return the playground as active. This makes the app immediately usable on first launch.

**Protection**: `project.remove()` rejects deletion if `id === PLAYGROUND_PROJECT_ID`.

## Renderer — Welcome Panel

When `hasProject={false}` (no active project, but projects exist), add a "Quick Chat" button alongside "Open Project":

```
+----------------------------------+
|          [Neovate Logo]          |
|   What can I help you with?      |
|                                  |
|   Get started:                   |
|   [Open Project]  [Quick Chat]   |
+----------------------------------+
```

"Quick Chat" activates the playground project and creates a new session.

## Renderer — Session Item Badge

In `SessionItem`, when `projectPath` matches the playground path, use `MessageCircle` (lucide) instead of `Comment01Icon` (hugeicons). No other visual change — session appears in normal chronological timeline.

## Renderer — Project List

- `ensurePlayground()` appends the playground last when first created — this is just the initial position
- Playground participates in drag-sort reorder like any other project; user reorder is persisted and respected
- Uses a differentiating icon (e.g. `MessageCircle`) instead of folder icon
- Remove/archive action is hidden for the playground project

## Keyboard Shortcut

Add a `quickChat` keybinding action:

```typescript
// src/renderer/src/lib/keybindings.ts
export type KeybindingAction = ... | "quickChat";

// Default binding
quickChat: "Cmd+Shift+N"
```

The shortcut activates the playground project and creates a new session, regardless of which project is currently active. Customizable in Settings > Keybindings.

## Change Map

| Layer                             | File(s)                                                        | Change                                                                                          |
| --------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Constants**                     | `src/shared/features/project/constants.ts` (new)               | `PLAYGROUND_PROJECT_ID`, re-export from shared                                                  |
| **Main — App paths**              | `src/main/core/app-paths.ts`                                   | Export `PLAYGROUND_DIR`                                                                         |
| **Main — Store**                  | `src/main/features/project/project-store.ts`                   | Add `ensurePlayground()` (mkdirSync + upsert entry) + `getPlayground()`                         |
| **Main — Router**                 | `src/main/features/project/router.ts`                          | Call `ensurePlayground()` on init. Reject `remove()` for playground. Fallback in `getActive()`. |
| **Renderer — Welcome**            | `src/renderer/src/features/agent/components/welcome-panel.tsx` | Add "Quick Chat" button                                                                         |
| **Renderer — Project store**      | `src/renderer/src/features/project/store.ts`                   | Add `getPlayground()` selector.                                                                 |
| **Renderer — Session item**       | `src/renderer/src/features/agent/components/session-item.tsx`  | Icon badge for playground sessions                                                              |
| **Renderer — Project list**       | Project selector/list components                               | Hide remove for playground. Show icon.                                                          |
| **Renderer — Keybindings**        | `src/renderer/src/lib/keybindings.ts`                          | Add `quickChat` action with `Cmd+Shift+N` default                                               |
| **Renderer — Global keybindings** | `src/renderer/src/hooks/use-global-keybindings.ts`             | Handle `quickChat` action                                                                       |
| **Renderer — Settings**           | Keybindings settings panel                                     | `quickChat` appears as configurable shortcut                                                    |
| **i18n**                          | Translation files                                              | `project.playground`, `project.quickChat`, `settings.keybindings.quickChat`                     |

## What Stays Unchanged

- Session creation flow (`useNewSession`, `chat-manager`, `session-manager`)
- Session listing and filtering
- Archive, pin, provider selection
- Pre-warming
- Multi-project vs single-project mode logic
- `Project` type definition (no schema change)

## Future Considerations (not this iteration)

- **"Promote to project"**: If a user does real work in a playground session and wants to save it as a proper project. The stable ID + real project approach leaves this door open.
