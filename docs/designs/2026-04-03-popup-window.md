# Popup Window

Global-shortcut-triggered floating chat window for quick message input from anywhere.

## Overview

A small, always-on-top floating Electron window that appears when the user presses a global OS-level shortcut (default: `Option+N`). The window contains a message input with project selector and permission mode selector. After sending, the window transitions to show the message list with streaming response. The user can follow up, close with `Cmd+W`, or dismiss with `Esc`.

## Architecture

### Approach: Plugin Window + Independent Stores

Uses the existing `WindowContribution` plugin system to register a `"popup-window"` window type. The popup loads the same renderer bundle, so all components can be reused directly. However, each BrowserWindow runs its own renderer process with independent JavaScript context — Zustand stores and `claudeCodeChatManager` are **separate instances** per window. Cross-window sync is handled via `BroadcastChannel`.

### Cross-Window Sync via BroadcastChannel

Each BrowserWindow gets its own store instances. To keep the main window and popup in sync, use the browser-native `BroadcastChannel` API (both renderers share the same origin).

**Channel**: `"neovate:cross-window"`

**Messages**:

- `{ type: "session-created", sessionId, projectPath }` — popup -> main: refresh session list in sidebar
- `{ type: "navigate-to-session", sessionId, projectPath }` — popup -> main: open a specific session (for "Open in Main" and notification click-through)
- `{ type: "project-switched", projectPath }` — popup -> main: sync active project when popup changes project selector
- `{ type: "config-changed", key, value }` — bidirectional: sync config/theme changes between windows

**Listeners**:

- Main window listens for session and navigation messages, refreshes agent store / session list
- Both windows listen for `config-changed` and update their local config stores accordingly
- This ensures theme changes, permission mode defaults, send-with-enter preference, etc. stay in sync

New file: `src/renderer/src/lib/cross-window-channel.ts` — thin wrapper around `BroadcastChannel` with typed message helpers.

### Flow

```
User presses global shortcut (Option+N)
  -> Main process globalShortcut callback fires
  -> If popup doesn't exist: windowManager.open({ windowType: "popup-window", ... })
  -> If popup exists but unfocused/hidden: show + focus it
  -> If popup exists and focused: hide it (toggle behavior)
  -> Renderer loads (first time: shows loading skeleton while stores hydrate)
  -> Plugin routes to PopupWindow component
  -> Auto-focus the MessageInput editor
  -> If previous session is still active (streaming/pending): resume showing it
  -> If previous session is idle/complete or no session: show blank input mode
  -> User sends message
  -> New session created in selected project via popup's own chat manager
  -> BroadcastChannel notifies main window: { type: "session-created" }
  -> Window transitions to show message list (streaming response)
  -> User can follow up, Esc to dismiss, or Cmd+W to close
```

## Window UI

### State 0: Loading (first create only)

While the popup renderer initializes stores, oRPC, config, and i18n:

```
+------------------------------------------+
|  (drag region)              Popup Window  |
+------------------------------------------+
|  +--------------------------------------+|
|  |                                      ||
|  |  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  ||  <- pulsing skeleton input area
|  |                                      ||
|  |  ░░░░  ░░░░  ░░░░  ░░░░░░░  ░░░░   ||  <- skeleton toolbar
|  +--------------------------------------+|
+------------------------------------------+
```

Lightweight shimmer skeleton matching the input layout. Only shown on very first creation — subsequent opens are instant since the window is hidden, not destroyed.

### State 1: Input Mode (initial / after previous session completes)

Compact window for quickly firing off a message. ~480x320px.

```
+------------------------------------------+
|  (drag region)         [->] Popup Window  |  <- frameless titlebar + "Open in Main" button
+------------------------------------------+
|  +--------------------------------------+|
|  |                                      ||
|  |  Type your message...                ||  <- reused MessageInput (auto-focused)
|  |                                      ||
|  | [Attach] [Model] [Perm] [Project v]  [Send] ||  <- compact toolbar
|  +--------------------------------------+|
+------------------------------------------+
```

### State 2: Chat Mode (after send)

Window grows smoothly to ~480x560px to show the conversation.

```
+------------------------------------------+
|  (drag region)         [->] Popup Window  |  <- "Open in Main" button in titlebar
+------------------------------------------+
|  +--------------------------------------+|
|  |  You: "Fix the login bug"            ||
|  |                                      ||  <- reused message list
|  |  Assistant: Looking at auth.ts...    ||
|  |  (streaming)                         ||
|  +--------------------------------------+|
|  +--------------------------------------+|
|  |  Follow up...                        ||  <- reused MessageInput
|  | [Attach] [Model] [Perm] [Project v]  [Send] ||
|  +--------------------------------------+|
+------------------------------------------+
   Esc (input empty) or Cmd+W to dismiss
```

### No-Project Empty State

If the user has no projects configured, the input mode shows a helpful empty state instead of a broken selector:

```
+------------------------------------------+
|  (drag region)              Popup Window  |
+------------------------------------------+
|                                          |
|    No projects configured.               |
|    [Open Settings]                       |  <- opens main window project settings
|                                          |
+------------------------------------------+
```

### No footer. Session continues in background after close.

## Window Behavior

### Always on Top

The popup is a utility window. BrowserWindow options:

- `alwaysOnTop: true` - never buried behind other windows
- `skipTaskbar: true` (Windows) - no taskbar clutter
- macOS: `type: "panel"` for proper utility window behavior
- `autoHideMenuBar: true`

### Escape to Dismiss

- `Esc` when input is **empty**: hide the popup window (not destroy - preserves state)
- `Esc` when input has **content**: clear the input first (standard editor behavior), second `Esc` hides
- Matches the Spotlight/Raycast mental model: shortcut opens, Esc dismisses

### Session Resumption on Re-open

When the shortcut is pressed and the popup reappears:

- If the **previous popup session is still active** (streaming, waiting for permission, or has pending tool use): **resume showing it** - don't create a new blank input
- If the previous session is **idle/complete** or **no session exists**: show blank input mode
- This prevents session sprawl and makes the popup feel stateful

### "Stay Open = false" Behavior

When `popupWindowStayOpen` is disabled:

1. User sends message -> popup closes immediately
2. BroadcastChannel sends `{ type: "session-created" }` so the main window refreshes its session list
3. A **system notification** is shown: "Session started in {project-name}" - clicking it opens the main window and navigates to that session (main process handles Notification click event, shows main window, sends IPC to navigate)
4. The session runs in the background as normal

### Open in Main Window

A small button (`[->]` icon) in the **titlebar area** of the popup:

- BroadcastChannel sends `{ type: "navigate-to-session", sessionId, projectPath }`
- Main window navigates to that session and comes to front
- Closes the popup window
- Keybinding: `Cmd+Shift+Enter` as an alternative

### Multi-Monitor: Center on Active Display

Instead of restoring the last absolute position (which breaks on multi-monitor):

- **Remember window size** only (width x height)
- **Always center on the display where the mouse cursor currently is**
- This ensures the popup appears near the user regardless of which monitor they're working on

### Auto-Focus on Open

When the popup appears (created or re-shown), the Tiptap editor inside `MessageInput` must be focused immediately:

- On initial mount: popup component dispatches `window.dispatchEvent(new Event("neovate:focus-input"))` after render
- On re-show (window was hidden): main process sends a `"popup-window:shown"` IPC message, popup component listens and dispatches the focus event
- This ensures keyboard-first UX — user presses shortcut and starts typing immediately

### Smooth Resize Animation

When transitioning from input mode (320px) to chat mode (560px) on first send:

- macOS: use `win.setBounds({ height: 560 }, { animate: true })` for native smooth animation
- Windows/Linux: interpolate height over ~200ms using a timer with `win.setBounds()` steps
- The resize is triggered by the popup renderer via IPC: `client.window.resizePopup({ height: 560 })`

## InputToolbar Changes

Add optional `showProjectSelector` prop to `InputToolbar`. When true, render `ProjectSelector` (compact "select" mode) after the permission selector.

Popup toolbar order:

```
[Attach] [ModelSelect] [PermissionSelect] [ProjectSelector v] ... [Send]
```

### Compact Mode for Popup

At 480px width, the toolbar can overflow with 5 items. When `showProjectSelector` is true, selectors use **compact mode**:

- `ModelSelect`: icon-only (no text label), just model icon + chevron
- `PermissionSelect`: icon-only, just shield icon + chevron
- `ProjectSelector`: truncated project name (max ~12 chars) + chevron
- Full labels shown in dropdown menus as usual

Only rendered in popup window context.

## Keybinding Changes

### Rename `quickChat` to "Quick Chat in Playground"

The existing `quickChat` keybinding action (`Cmd+Shift+N`) and the popup window's global shortcut (`Option+N`) are separate features:

- **`quickChat`** (`Cmd+Shift+N`): Renamed to **"Quick Chat in Playground"**. Renderer-only shortcut that creates a new session in the playground project within the main window. Unchanged behavior.
- **Popup Window** (`Option+N`): New global OS-level shortcut that opens the popup window. Configured in settings, not in the keybindings panel.

Update in `keybindings.ts`:

- `KEYBINDING_LABELS.quickChat`: `"Quick Chat"` -> `"Quick Chat in Playground"`
- `KEYBINDING_LABEL_KEYS.quickChat`: update i18n key value to `"Quick Chat in Playground"`

## Main Process

### Global Shortcut

New file: `src/main/features/popup-window/global-shortcut.ts`

- Registered on app startup if `popupWindowEnabled` config is true (default: true)
- Default: `Alt+N`
- Toggle behavior: create -> show+focus -> hide -> show+focus -> ...
- Config-reactive: re-registers when shortcut string changes in config
- Window is hidden (not destroyed) on dismiss to enable fast re-open and session resumption
- **Conflict detection**: `globalShortcut.register()` returns false if the shortcut is already taken by another app. On failure:
  - Log a warning in main process
  - Send IPC message to renderer so settings UI can show: "Shortcut is in use by another application"
  - Store failure state in config store so the warning persists across settings opens

### Window Creation Options

```ts
{
  width: savedWidth ?? 480,
  height: savedHeight ?? 320,
  // Centered on display where cursor currently is
  alwaysOnTop: true,
  skipTaskbar: true,           // Windows
  type: "panel",               // macOS utility window
  autoHideMenuBar: true,
  titleBarStyle: "hiddenInset",
  resizable: true,
  minimizable: false,
}
```

### Window Size Persistence

New file: `src/main/features/popup-window/popup-window-store.ts`

- Separate electron-store (`~/.neovate-desktop/popup-window-state.json`)
- Persists **size only** (width, height) - not position
- On open: use saved size, center on active display (display containing mouse cursor)
- On resize: debounced save (same pattern as main window)
- Default size: 480x320 (input mode), auto-grows to 480x560 on first send

### BrowserWindowManager Extension

Extend `open()` to support the popup-window type's needs:

- Accept optional `x`, `y`, `alwaysOnTop`, `skipTaskbar`, `type` in `OpenWindowOptions`
- Popup-window type uses its own size store + active-display centering
- Override close behavior for popup-window: hide instead of destroy (for session resumption)

## Settings

### General > Advanced

Three new rows added to the Advanced settings group:

| Setting                            | Control           | Default | Config Key            |
| ---------------------------------- | ----------------- | ------- | --------------------- |
| Popup Window                       | Switch            | enabled | `popupWindowEnabled`  |
| Popup Window Shortcut              | Keybinding editor | `Alt+N` | `popupWindowShortcut` |
| Popup Window: Stay open after send | Switch            | true    | `popupWindowStayOpen` |

The shortcut editor shows a warning badge if global shortcut registration failed (conflict with another app).

### Config Store Changes

Add to `AppConfig` in `src/shared/features/config/types.ts`:

```ts
popupWindowEnabled: boolean; // default: true
popupWindowShortcut: string; // default: "Alt+N"
popupWindowStayOpen: boolean; // default: true
```

## New Files

| File                                                       | Purpose                                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/main/features/popup-window/global-shortcut.ts`        | Register/unregister Electron globalShortcut, toggle window, conflict detection                                 |
| `src/main/features/popup-window/popup-window-store.ts`     | Persist window size via electron-store                                                                         |
| `src/renderer/src/lib/cross-window-channel.ts`             | Typed BroadcastChannel wrapper for cross-window sync (session, navigation, config)                             |
| `src/renderer/src/plugins/popup-window/index.ts`           | RendererPlugin: register "popup-window" window type                                                            |
| `src/renderer/src/plugins/popup-window/popup-window.tsx`   | Window root: loading skeleton, input mode -> chat mode, session resumption, auto-focus, no-project empty state |
| `src/renderer/src/plugins/popup-window/locales/en-US.json` | i18n strings                                                                                                   |

## Modified Files

| File                                                                     | Change                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `src/renderer/src/features/agent/components/input-toolbar.tsx`           | Add optional `showProjectSelector` prop; compact icon-only mode for selectors                                            |
| `src/renderer/src/features/settings/components/panels/general-panel.tsx` | Add 3 rows for popup window settings + shortcut conflict warning                                                         |
| `src/shared/features/config/types.ts`                                    | Add popup window config keys to AppConfig                                                                                |
| `src/main/features/config/config-store.ts`                               | Add defaults for new config keys                                                                                         |
| `src/main/core/browser-window-manager.ts`                                | Support alwaysOnTop, skipTaskbar, type in OpenWindowOptions; active-display centering; hide-instead-of-destroy for popup |
| `src/main/index.ts`                                                      | Initialize global shortcut on app start                                                                                  |
| `src/renderer/src/core/app.tsx`                                          | Listen on BroadcastChannel for cross-window messages (session-created, navigate-to-session, config-changed)              |
| `src/renderer/src/lib/keybindings.ts`                                    | Rename `quickChat` label to "Quick Chat in Playground"                                                                   |
| `src/renderer/src/features/config/store.ts`                              | Broadcast config changes to BroadcastChannel; listen and apply incoming config-changed messages                          |

## Component Reuse

- **MessageInput** - used as-is, no changes to the component itself
- **InputToolbar** - changes: optional project selector prop, compact icon-only mode
- **ProjectSelector** - reused in compact "select" mode
- **Message list / processing / permission dialogs** - all reused from existing agent chat
- Stores are **independent per window** (separate renderer processes) — cross-window sync via BroadcastChannel

## Behavior Summary

1. **Shortcut** (`Option+N`): Toggle popup window (create/show/hide)
2. **Always on top**: Utility panel window, never buried behind other apps
3. **Esc to dismiss**: Hide window when input is empty (Spotlight-like)
4. **Session resumption**: Re-opening shows in-progress session, blank input only when idle/complete
5. **Auto-focus**: Editor focused immediately on open — type right away
6. **Loading skeleton**: Shimmer UI on first create while stores hydrate; subsequent opens are instant
7. **Input mode**: MessageInput with compact toolbar: [Attach] [Model] [Permission] [Project] [Send]
8. **On send**: Creates new session via popup's own chat manager, notifies main window via BroadcastChannel
9. **Stay open** (default: true): Show streaming response with smooth resize animation, allow follow-ups
10. **Stay open = false**: Close popup, refresh main window session list via BroadcastChannel, show system notification
11. **Open in Main**: Titlebar button (`Cmd+Shift+Enter`) transfers session to main window via BroadcastChannel
12. **Multi-monitor**: Remember size, always center on display where cursor is
13. **Smooth resize**: Animated height transition from input mode (320px) to chat mode (560px)
14. **Shortcut conflicts**: Detect registration failure, warn in settings UI
15. **Cross-window sync**: BroadcastChannel for session-created, navigate-to-session, project-switched, config-changed
16. **Config/theme sync**: Bidirectional config changes propagated between windows via BroadcastChannel
17. **No-project empty state**: Helpful message with button to open settings when no projects exist
18. **Keybinding rename**: Existing `quickChat` (`Cmd+Shift+N`) renamed to "Quick Chat in Playground" — separate from popup window
19. **Close**: `Cmd+W` or `Esc` - session continues running in background
20. **Settings**: 3 controls in General > Advanced (enable, shortcut, stay-open)
