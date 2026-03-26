# Session Navigation (Cmd+Option+Left/Right)

## 1. Background

The sidebar displays chat sessions in various organizational modes. The `prevSession`/`nextSession` keybinding actions were already defined in the keybinding system but never implemented. This feature implements them with Cmd+Option+Left/Right defaults, enabling keyboard-driven session cycling.

## 2. Requirements Summary

- Cmd+Option+ArrowLeft navigates to the previous session; Cmd+Option+ArrowRight to the next.
- Session order matches the sidebar visual order: pinned first, then regular, each sorted by date descending.
- Behavior varies by mode:
  - **Single-project / byProject**: cycles sessions for the active project only
  - **Chronological**: cycles all sessions across all projects
- Persisted (not-yet-loaded) sessions are loaded on navigation.
- Configurable in Settings > Keybindings.

## 3. Acceptance Criteria

1. Pressing Cmd+Option+ArrowRight activates the next session in display order.
2. Pressing Cmd+Option+ArrowLeft activates the previous session.
3. Navigation wraps circularly (last → first, first → last).
4. In single-project and byProject modes, only the active project's sessions are cycled.
5. In chronological mode, sessions from all projects are cycled, switching active project as needed.
6. Navigating to a persisted session loads it from disk and activates it.
7. Both shortcuts appear in Settings > Keybindings and are user-customizable.
8. The shortcut is blocked when the settings panel is open.

## 4. Problem Analysis

The `prevSession`/`nextSession` keybinding actions existed as type definitions with default key combos (Cmd+Option+ArrowUp/Down) but had no handler in `useGlobalKeybindings`. The defaults are changed to Left/Right per user request, and the navigation logic is implemented.

The session ordering logic mirrors `useFilteredSessions` but runs imperatively (not as a React hook) since it's called from the global keydown handler.

## 5. Decision Log

**1. Reuse existing keybinding actions or create new ones?**

- Options: A) Reuse `prevSession`/`nextSession` · B) Create new actions
- Decision: **A)** — Actions already defined with labels and i18n keys. Just change defaults and implement.

**2. Default key combos?**

- Options: A) Keep `Cmd+Option+ArrowUp/Down` · B) Change to `Cmd+Option+ArrowLeft/Right`
- Decision: **B)** — User explicitly requested Left/Right.

**3. Navigation scope in byProject mode?**

- Options: A) Active project's sessions only · B) All sessions across all projects · C) Cross-project pinned + active project unpinned
- Decision: **A)** — Predictable, matches the user's project context. Cross-project navigation belongs in chronological mode.

**4. How to handle persisted sessions?**

- Options: A) Skip persisted, only navigate loaded sessions · B) Load persisted on navigation
- Decision: **B)** — Full navigation through the session list regardless of load state. Mirrors click behavior.

**5. Where to place the navigation function?**

- Options: A) Inline in `useGlobalKeybindings` · B) Extract to `navigate-session.ts`
- Decision: **B)** — Keeps the keybinding handler lean.

## 6. Design

The `navigateSession(direction)` function:

1. Reads `multiProjectSupport`, `sidebarOrganize`, `sidebarSortBy` from config store
2. Determines scope: chronological → all projects; otherwise → active project
3. Builds pinned/archived ID sets for the scope
4. Collects memory + persisted sessions, splits into pinned/unpinned groups
5. Sorts each group by date descending (matching sidebar display order)
6. Concatenates: `[...pinned, ...unpinned]`
7. Finds current `activeSessionId`, computes target with modular arithmetic
8. Switches project if needed (chronological mode crossing project boundaries)
9. Activates: memory → `setActiveSession`, persisted → `claudeCodeChatManager.loadSession`

## 7. Files Changed

- `packages/desktop/src/renderer/src/lib/keybindings.ts` — Change `prevSession`/`nextSession` defaults from ArrowUp/Down to ArrowLeft/Right
- `packages/desktop/src/renderer/src/features/agent/navigate-session.ts` — New file with `navigateSession()` function
- `packages/desktop/src/renderer/src/hooks/use-global-keybindings.ts` — Import `navigateSession` and add handler cases

## 8. Verification

1. [AC1, AC2] With 3+ sessions, press Cmd+Option+Right repeatedly. Verify each press activates the next session.
2. [AC3] From the last session, press Right → wraps to first. From first, press Left → wraps to last.
3. [AC4] In byProject mode with multiple projects, verify navigation stays within the active project.
4. [AC5] In chronological mode, verify navigation crosses project boundaries and switches active project.
5. [AC6] Delete a loaded session from memory (archive it). Navigate to a persisted session. Verify it loads and activates.
6. [AC7] Open Settings > Keybindings. Verify "Previous Session" and "Next Session" show with Left/Right defaults.
7. [AC8] Open settings. Press Cmd+Option+Right. Verify nothing happens.
