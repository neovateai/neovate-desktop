# Cmd+K Command Palette

## Overview

A unified **Cmd+K** palette that serves as the central quick-access point for the app. Default mode shows recent sessions and top commands. Typing `>` switches to command-only mode.

## Approach

Use the existing shadcn `Command` component (which wraps cmdk). It's already in `components/ui/`, battle-tested, accessible, and handles keyboard navigation, fuzzy search, and grouping out of the box.

Alternatives considered:

- **Custom from scratch** — Full control but high effort and risky UX quality.
- **Dialog + filtered list** — Simpler but less polished, mixes patterns.

## Interaction Design

### Opening

- `Cmd+K` opens the palette (reassign `clearTerminal` to `Cmd+Shift+K`)
- Centered modal overlay with backdrop blur, ~540px wide
- Auto-focused search input

### Default view (empty query)

```
+---------------------------------------------+
|  Search sessions and commands...             |
|---------------------------------------------|
|  Recent Sessions                             |
|    * Fix authentication bug          2h ago  |
|    * Refactor payment module         1d ago  |
|    * Add dark mode support           3d ago  |
|                                              |
|  Quick Actions                               |
|    + New Chat                       Cmd+N    |
|    * Open Settings                  Cmd+,    |
|    * Toggle Theme                   Opt+Cmd+T|
|    * Toggle Terminal                Cmd+J    |
|    * Toggle Files                   Cmd+G    |
+---------------------------------------------+
```

### Session search mode (type normally)

- Fuzzy matches against session titles
- Shows matching sessions sorted by relevance, then recency
- Enter to switch to selected session
- Commands that match also appear below sessions

### Command mode (type `>`)

```
+---------------------------------------------+
|  > toggle th                                 |
|---------------------------------------------|
|  Commands                                    |
|    * Toggle Theme                   Opt+Cmd+T|
|    * Toggle Terminal                Cmd+J    |
|    * Toggle Changes                 Cmd+E    |
+---------------------------------------------+
```

### Closing

- `Escape` or clicking backdrop closes
- Selecting an item closes and executes

## Command Registry

### Session

| Command          | Action               | Shortcut      |
| ---------------- | -------------------- | ------------- |
| New Chat         | Create new session   | Cmd+N         |
| Previous Session | Navigate to previous | Opt+Cmd+Left  |
| Next Session     | Navigate to next     | Opt+Cmd+Right |

### Panels

| Command         | Action                 | Shortcut    |
| --------------- | ---------------------- | ----------- |
| Toggle Terminal | Show/hide terminal     | Cmd+J       |
| Toggle Files    | Show/hide file browser | Cmd+G       |
| Toggle Changes  | Show/hide git changes  | Cmd+E       |
| Toggle Browser  | Show/hide browser      | Shift+Cmd+B |
| Toggle Sidebar  | Show/hide sidebar      | Cmd+B       |

### App

| Command              | Action               | Shortcut    |
| -------------------- | -------------------- | ----------- |
| Open Settings        | Open settings page   | Cmd+,       |
| Toggle Theme         | Switch light/dark    | Opt+Cmd+T   |
| Toggle Multi-Project | Enable/disable       | Shift+Cmd+E |
| Pin/Unpin Session    | Toggle pin on active | Cmd+D       |

### Additional

| Command                   | Action                      | Why                                     |
| ------------------------- | --------------------------- | --------------------------------------- |
| Copy Session as Markdown  | Export current conversation | Common need -- share/save conversations |
| Reload Window             | Refresh the app             | Dev/debug convenience                   |
| Toggle Notification Sound | Quick toggle                | Avoids opening settings                 |
| Switch Provider           | Quick provider switch       | Power user action                       |
| Archive Session           | Archive current session     | Quick cleanup                           |

## Architecture

```
src/renderer/src/features/command-palette/
  command-palette.tsx          # Main component (Command + Dialog)
  store.ts                    # Zustand store (open/close state)
  use-command-registry.ts     # Hook that builds command list
  types.ts                    # CommandItem type
```

### Key types

```typescript
type CommandItem = {
  id: string;
  label: string;
  group: "session" | "command";
  category?: string; // "Panels" | "App" | "Session"
  icon?: ReactNode;
  shortcut?: string[]; // ["Cmd", "J"]
  keywords?: string[]; // extra search terms
  onSelect: () => void;
};
```

### Integration points

1. `use-global-keybindings.ts` -- Add `Cmd+K` -> `openCommandPalette`
2. `lib/keybindings.ts` -- Reassign `clearTerminal` to `Cmd+Shift+K`, add `openCommandPalette` as `Cmd+K`
3. `App.tsx` -- Mount `<CommandPalette />` at root level
4. `useAgentStore` -- Source session data for search
5. Existing action handlers -- reuse toggle/navigation functions already in the global keybindings hook

### Session search data flow

- Pull from `useAgentStore.agentSessions` (persisted session metadata)
- Fuzzy match on `title` field
- Sort: exact matches first, then fuzzy by recency
- cmdk handles the fuzzy matching natively

## Component Design

### CommandPalette.tsx

- Wraps shadcn `Command` inside a `Dialog` (or bare `Command.Dialog` from cmdk)
- Listens to store's `isOpen` state
- Renders two groups based on input:
  - No `>` prefix: `<CommandGroup heading="Recent Sessions">` + `<CommandGroup heading="Quick Actions">`
  - `>` prefix: `<CommandGroup heading="Commands">` only, strips `>` from search
- Each CommandItem renders: icon, label, and optional `<kbd>` shortcut on the right
- On select: execute action, close palette

### store.ts

```typescript
{
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
}
```

### use-command-registry.ts

- Collects all commands from existing action handlers (same functions used in `use-global-keybindings.ts`)
- Pulls session list from `useAgentStore`
- Returns `{ sessions: CommandItem[], commands: CommandItem[] }`
- Memoized -- only recomputes when sessions or config change

## Visual Styling

- `bg-popover` background with `border` and `shadow-lg`
- `rounded-[0.625rem]` matching the app's radius token
- Backdrop: `bg-black/50 backdrop-blur-sm`
- Input: clean, borderless, large text -- matches the "quiet confidence" aesthetic
- Items: `hover:bg-accent` with smooth transition
- Selected item: subtle `bg-accent` highlight
- Shortcuts rendered with `<Kbd>` component (exists in `components/ui/kbd.tsx`)
- Separator between groups
- Max height ~400px with scroll
- Animation: fade + slight scale-up on open via `motion`

## Keybinding Changes

| Action               | Current | New           |
| -------------------- | ------- | ------------- |
| `clearTerminal`      | `Cmd+K` | `Cmd+Shift+K` |
| `openCommandPalette` | _(new)_ | `Cmd+K`       |

Safe reassignment -- `Cmd+K` for command palette is far more valuable in an AI desktop app. Power users can reconfigure via Settings > Keybindings.

## Enhancements

### 1. Frecency ranking

Track which commands/sessions the user selects from the palette. Rank by frequency x recency (like Alfred/Raycast). Store a `Map<id, { count, lastUsed }>` persisted to localStorage. The palette gets smarter over time -- most-used actions float to the top.

Add to store:

```typescript
frecency: Map<string, { count: number; lastUsed: number }>;
recordSelect: (id: string) => void;
```

### 2. Search session content, not just titles

Many sessions have auto-generated titles that aren't memorable. Extend fuzzy search to match against the first user message or a summary snippet. The `agentSessions` metadata may already have enough, or index the first message as a `keywords` field on the session CommandItem.

### 3. Contextual commands

Some commands only make sense in certain states. Filter them dynamically:

| Command         | Show when                    |
| --------------- | ---------------------------- |
| Stop Session    | Active session is streaming  |
| Unpin Session   | Active session is pinned     |
| Pin Session     | Active session is not pinned |
| Archive Session | A session is active          |

Add an optional `when?: () => boolean` predicate to `CommandItem`. Items where `when` returns false are excluded from results.

```typescript
type CommandItem = {
  // ...existing fields
  when?: () => boolean; // only show when this returns true
};
```

### 4. No-match fallback: create chat

If a search yields no session matches, show a footer item: **"New chat: {query}"**. Selecting it starts a new session with the typed text as the first message. Turns a missed search into a productive action.

### 5. Current state hints for toggles

For toggle commands, show the current state inline so users know what will happen:

```
  Toggle Theme               (dark)    Opt+Cmd+T
  Toggle Sidebar              (on)     Cmd+B
  Toggle Terminal             (off)    Cmd+J
```

Add an optional `stateLabel?: () => string` to `CommandItem`:

```typescript
type CommandItem = {
  // ...existing fields
  stateLabel?: () => string; // e.g., () => isDark ? "dark" : "light"
};
```

### 6. Project scoping in multi-project mode

When `multiProjectSupport` is enabled, default session search to the current project only. Add a subtle footer action "Search all projects" (or `@all` prefix) to widen scope. Prevents noise from unrelated project sessions.

### 7. Subcommand drilling (TODO)

Commands like "Switch Provider" or "Open Settings" have natural sub-options. Instead of immediately executing, pressing Enter or Right Arrow drills into a nested list (e.g., providers list, settings tabs). Backspace on empty input or Left Arrow pops back up. Keeps everything in the palette instead of bouncing to another UI.

Not in initial implementation -- add after the core palette is stable.

### 8. Slash command unification (TODO)

The message input already supports `/` commands. The palette could handle those too: typing `/` prefix shows available slash commands for the active session. Makes Cmd+K the single universal entry point -- sessions (default), commands (`>`), slash commands (`/`).

Not in initial implementation -- requires deeper integration with session command state.

### 9. Session preview snippet

When a session is highlighted (keyboard-navigated, not yet selected), show 1-2 lines of the first user message as a muted subtitle below the title. Helps disambiguate sessions with similar auto-generated names.

```
  Recent Sessions
    Fix authentication bug                    2h ago
    "Can you fix the login redirect loop..."
    Fix auth tests                            3h ago
    "The auth test suite is failing on..."
```

### 10. Session metadata inline

Show relative time and project name right-aligned on each session item, single line:

```
  msg-icon  Fix authentication bug              2h ago · neovate-desktop
```

Changes:

- Add `metadata?: string` field to `CommandItem` type
- Build metadata string in `use-command-registry.ts` from `createdAt` (relative time) and `cwd` (last path segment as project name)
- Render right-aligned in `PaletteItem`, muted text, `shrink-0` so it never truncates (title truncates instead)
- Format: `{relativeTime} · {projectName}` -- e.g. `2h ago · neovate-desktop`. If `cwd` is missing, just show time.

### 11. Destructive action guard

For actions like "Archive Session", don't execute immediately. Replace the item inline with a confirmation: `Archive "Fix auth bug"? Enter to confirm`. Prevents accidents without a modal dialog.

### 11. Animated placeholder cycling

The search input placeholder subtly cycles between hints every few seconds: `Search sessions...` -> `Type > for commands...`. Fade transition only, no sliding. Teaches discoverability without cluttering the UI.
