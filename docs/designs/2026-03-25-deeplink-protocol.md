# Deeplink Protocol Registration & Handling

## 1. Background

The app has a "Copy Deeplink" context menu item on session items (added in #309) that copies a `neovate://session/<id>?project=<path>` URL. However, the `neovate://` protocol is not registered, so the URL doesn't actually open the app when clicked. This design adds protocol registration and incoming deeplink handling.

## 2. Requirements Summary

**Goal:** Register the `neovate://` custom protocol so deeplinks copied from session items actually work — launching/focusing the app and navigating to the correct project and session.

**Scope:**

- In scope: protocol registration (build + runtime), URL parsing, project switching, session activation, error handling
- Out of scope: Windows/Linux support (app is macOS-only), sharing deeplinks across machines

**Key decisions:**

- Dev builds use `neovate-dev://`, prod uses `neovate://` (avoids conflicts)
- Auto-switch project when deeplink targets a different project
- Toast notification when session/project not found
- IPC-based approach (not oRPC) to push deeplink events to renderer

## 3. Acceptance Criteria

1. Opening `neovate://session/<id>?project=<path>` launches the app (or focuses it if running)
2. The app switches to the correct project and activates/loads the session
3. Dev builds use `neovate-dev://` scheme, prod uses `neovate://`
4. If the project or session doesn't exist, a toast notification is shown
5. The "Copy Deeplink" menu item uses the correct scheme based on environment
6. Cold-start deeplinks (app not running) work correctly

## 4. Decision Log

**1. URL scheme for dev vs prod?**

- Options: A) Same `neovate://` for both · B) Separate `neovate-dev://` for dev
- Decision: **B) Separate** — matches the existing appId split (`com.neovateai.desktop.dev` vs `.desktop`), avoids conflicts when both are installed

**2. Cross-project navigation?**

- Options: A) Auto-switch project · B) Same-project only · C) Switch with confirmation
- Decision: **A) Auto-switch** — seamless UX, the deeplink carries the project path so navigation is unambiguous

**3. Error handling for missing session/project?**

- Options: A) Toast notification · B) Open project anyway · C) Silent ignore
- Decision: **A) Toast** — non-intrusive, tells the user what went wrong. Uses existing `toastManager.add()` pattern.

**4. How to route deeplinks from main to renderer?**

- Options: A) IPC channel (like `menu:open-settings`) · B) oRPC endpoint
- Decision: **A) IPC** — deeplinks are push events, not request-response. Mirrors the existing `onOpenSettings` pattern exactly

**5. How to handle race condition between project switch and session load?**

- Options: A) Store pending deeplink in agent store, resolve when sessions arrive · B) Poll/retry with timeout · C) Ignore, hope it works
- Decision: **A) Pending deeplink** — `setAgentSessions` fires after `client.agent.listSessions()` completes on project switch. Check for pending deeplink there and load the target session. Clean, no polling.

## 5. Design

### URL Format

```
neovate://session/<sessionId>?project=<urlEncodedProjectPath>
neovate-dev://session/<sessionId>?project=<urlEncodedProjectPath>
```

### Protocol Registration

**Build time** — `configs/electron-builder.mjs`:

Add a `protocols` entry so macOS associates the scheme with the app bundle:

```js
protocols: [{ name: "Neovate", schemes: [isDev ? "neovate-dev" : "neovate"] }];
```

**Runtime** — `src/main/index.ts`:

Register at startup for dev mode (where the app isn't installed via .dmg):

```js
const scheme = isDev ? "neovate-dev" : "neovate";
app.setAsDefaultProtocolClient(scheme);
```

### Handling Incoming Deeplinks (Main Process)

**Critical: cold-start timing.** On macOS, when the app is **not running** and the user clicks a deeplink, `open-url` fires **before** `app.whenReady()`. The listener must be registered at the top level (not inside `whenReady()`), and the URL must be buffered until the window is ready.

In `src/main/index.ts`:

```js
// ── Top level (before app.whenReady) ──
let pendingDeeplink: { sessionId: string; project: string } | null = null;

app.on("open-url", (event, url) => {
  event.preventDefault();
  const parsed = parseDeeplinkUrl(url);
  if (!parsed) return;

  const win = mainApp.windowManager.mainWindow;
  if (win) {
    win.show();
    win.focus();
    win.webContents.send("deeplink", parsed);
  } else {
    // App is launching cold — buffer until window is ready
    pendingDeeplink = parsed;
  }
});
```

```js
// ── Inside app.whenReady(), after window creation ──
// Flush any buffered deeplink once renderer is ready
if (pendingDeeplink) {
  const win = mainApp.windowManager.mainWindow;
  if (win) {
    win.webContents.once("did-finish-load", () => {
      win.webContents.send("deeplink", pendingDeeplink);
      pendingDeeplink = null;
    });
  }
}
```

**URL parsing** (`parseDeeplinkUrl`): extracts `sessionId` from the path (`/session/<id>`) and `project` from the query param via `decodeURIComponent`. Returns `null` for invalid/unrecognized URLs. This is a simple standalone function in the same file — no need for a separate module.

### Preload Bridge

In `src/preload/index.ts`, add to the `api` object:

```js
isDev: !app.isPackaged,  // or hardcode based on build env
onDeeplink: (callback) => {
  const handler = (_e, data) => callback(data);
  ipcRenderer.on("deeplink", handler);
  return () => ipcRenderer.removeListener("deeplink", handler);
}
```

Update `src/preload/index.d.ts`:

```ts
interface NeovateApi {
  homedir: string;
  isDev: boolean;
  onOpenSettings: (callback: () => void) => () => void;
  onDeeplink: (callback: (data: { sessionId: string; project: string }) => void) => () => void;
}
```

### Renderer Handling

There are two distinct cases when a deeplink arrives:

**Case 1 — Same project is already active:** The session is either in memory (just `setActiveSession`) or persisted (needs `loadSession` via `claudeCodeChatManager`).

**Case 2 — Different project:** Must switch project first, wait for sessions to load, then activate/load the target session. This involves a race condition because `switchToProjectByPath` triggers an async `listSessions` call in `AgentChat`'s `useEffect`, and the target session isn't available until that completes.

**Solution: pending deeplink in agent store.**

Add a `pendingDeeplink` field to the agent store:

```ts
// In agent store
pendingDeeplink: { sessionId: string; project: string } | null;
setPendingDeeplink: (dl: { sessionId: string; project: string } | null) => void;
```

In `setAgentSessions`, check for a pending deeplink and resolve it:

```ts
setAgentSessions: (agentSessions) => {
  set({ agentSessions, sessionsLoaded: true });
  // Resolve pending deeplink if one exists
  const { pendingDeeplink } = get();
  if (pendingDeeplink) {
    const found = agentSessions.find((s) => s.sessionId === pendingDeeplink.sessionId);
    if (found) {
      // Session exists — load it (handled by the deeplink listener in app.tsx)
      // Keep pendingDeeplink so the listener can pick it up
    } else {
      // Session not found in this project
      toastManager.add({ type: "warning", title: t("deeplink.sessionNotFound") });
      set({ pendingDeeplink: null });
    }
  }
};
```

Actually, cleaner approach — keep the resolution logic in `app.tsx`:

```ts
// In src/renderer/src/core/app.tsx
useEffect(() => {
  const cleanup = window.api.onDeeplink(async ({ sessionId, project }) => {
    const projectStore = useProjectStore.getState();
    const agentStore = useAgentStore.getState();

    // 1. Validate project exists in project list
    const targetProject = projectStore.projects.find((p) => p.path === project);
    if (!targetProject || targetProject.pathMissing) {
      toastManager.add({ type: "warning", title: t("deeplink.projectNotFound") });
      return;
    }

    // 2. Check if we need to switch projects
    const needsSwitch = projectStore.activeProject?.path !== project;

    if (needsSwitch) {
      // Store pending deeplink, then switch project
      agentStore.setPendingDeeplink({ sessionId, project });
      projectStore.switchToProjectByPath(project);
      // Session activation will happen when setAgentSessions fires (see below)
      return;
    }

    // 3. Same project — activate or load directly
    resolveDeeplinkSession(sessionId, project);
  });
  return cleanup;
}, []);

// Watch for pending deeplink resolution after sessions load
useEffect(() => {
  const pending = useAgentStore.getState().pendingDeeplink;
  if (pending && sessionsLoaded) {
    resolveDeeplinkSession(pending.sessionId, pending.project);
    useAgentStore.getState().setPendingDeeplink(null);
  }
}, [sessionsLoaded]);
```

The `resolveDeeplinkSession` helper:

```ts
function resolveDeeplinkSession(sessionId: string, project: string) {
  const { sessions } = useAgentStore.getState();

  // Already in memory — just switch
  if (sessions.has(sessionId)) {
    useAgentStore.getState().setActiveSession(sessionId);
    return;
  }

  // Check if it exists in persisted sessions
  const { agentSessions } = useAgentStore.getState();
  const info = agentSessions.find((s) => s.sessionId === sessionId);
  if (!info) {
    toastManager.add({ type: "warning", title: t("deeplink.sessionNotFound") });
    return;
  }

  // Load the persisted session (same path as clicking a persisted session in sidebar)
  claudeCodeChatManager
    .loadSession(sessionId, info.cwd ?? project)
    .then(({ commands, models, currentModel, modelScope }) => {
      registerSessionInStore(sessionId, project, { commands, models, currentModel, modelScope });
    })
    .catch(() => {
      toastManager.add({ type: "warning", title: t("deeplink.sessionLoadFailed") });
    });
}
```

### Toast Usage

Follows the existing pattern from `use-project.ts`:

```ts
import { toastManager } from "../../../components/ui/toast";

toastManager.add({
  type: "warning",
  title: t("deeplink.projectNotFound"),
  description: t("deeplink.projectNotFoundDesc"),
});
```

### Update Copy Deeplink Handler

In `session-actions-menu.tsx`, use `window.api.isDev` to pick the correct scheme:

```js
const handleCopyDeeplink = () => {
  const scheme = window.api.isDev ? "neovate-dev" : "neovate";
  const deeplink = `${scheme}://session/${sessionId}?project=${encodeURIComponent(cwd)}`;
  navigator.clipboard.writeText(deeplink);
};
```

## 6. Files Changed

- `configs/electron-builder.mjs` — add `protocols` entry
- `src/main/index.ts` — `setAsDefaultProtocolClient` + `open-url` handler (top-level + whenReady flush)
- `src/preload/index.ts` — add `onDeeplink` and `isDev` to API object
- `src/preload/index.d.ts` — update `NeovateApi` type
- `src/renderer/src/features/agent/store.ts` — add `pendingDeeplink` + `setPendingDeeplink`
- `src/renderer/src/core/app.tsx` — handle incoming deeplinks with project switch + session resolution
- `src/renderer/src/features/agent/components/session-actions-menu.tsx` — use correct scheme via `window.api.isDev`
- `src/renderer/src/locales/en-US.json` — add deeplink error strings
- `src/renderer/src/locales/zh-CN.json` — add deeplink error strings

## 7. Verification

1. [AC1] Click a `neovate://session/...` link in browser/terminal — app launches or focuses
2. [AC2] Verify the app switches to the correct project and shows the target session
3. [AC3] Build dev and prod — confirm `neovate-dev://` vs `neovate://` are registered respectively
4. [AC4] Open a deeplink with a non-existent session ID — warning toast appears
5. [AC5] Copy deeplink in dev build — URL starts with `neovate-dev://`
6. [AC6] Cold-start: quit app, click deeplink — app launches and navigates to the session
7. [AC2] Cross-project: have project A active, open deeplink for project B session — auto-switches and loads
