# Fix window open handler crash

## 1. Background

The app crashes when a user clicks a link that no OS application can handle. The `shell.openExternal()` call in `setWindowOpenHandler` returns a rejected Promise that is never caught. The global `unhandledRejection` handler calls `process.exit(1)`, killing the entire app.

## 2. Requirements Summary

**Goal:** Prevent `shell.openExternal()` rejections from crashing the app.

**Scope:**

- In scope: Fix the unhandled rejection in `setWindowOpenHandler` at `browser-window-manager.ts:73-76`
- Out of scope: Secondary window handler gaps, webview URL validation, inline-citation URL parsing

## 3. Acceptance Criteria

1. Clicking a link that no OS app can handle must NOT crash the application
2. The error is logged so developers can diagnose URL issues
3. Valid `http://` / `https://` links continue to open in the default browser as before
4. No user-facing error dialog needed — silent graceful degradation

## 4. Problem Analysis

**Current code** (`browser-window-manager.ts:73-76`):

```typescript
win.webContents.setWindowOpenHandler((details) => {
  shell.openExternal(details.url);
  return { action: "deny" };
});
```

- `shell.openExternal()` returns `Promise<void>` — rejects when no app found
- `setWindowOpenHandler` is synchronous — cannot `await`
- No `.catch()` means the rejection is unhandled
- Global handler catches it and calls `process.exit(1)`

## 5. Decision Log

**1. How to prevent the unhandled rejection?**

- Options: A) Add `.catch()` · B) Wrap in try/catch with await · C) Validate URL scheme before calling
- Decision: **A + C combined** — `.catch()` handles the promise (can't await in sync callback). Protocol allowlist (`http:`, `https:`) blocks dangerous schemes as defense-in-depth.

**2. Should we show a user-facing error?**

- Options: A) Silent log · B) Dialog · C) Toast
- Decision: **A) Silent log** — Edge case, debug log is sufficient.

**3. Logger API?**

- Options: A) `log(...)` function call · B) `log.warn(...)` method call
- Decision: **B) `log.warn(...)`** — The imported `log` is `electron-log`'s default export (an object), consistent with rest of file.

## 6. Design

Add a protocol allowlist and `.catch()` handler:

```typescript
win.webContents.setWindowOpenHandler((details) => {
  const url = details.url;
  if (/^https?:\/\//.test(url)) {
    shell.openExternal(url).catch((err) => {
      log.warn("Failed to open external URL: %s %O", url, err);
    });
  } else {
    log.debug("Blocked non-http URL from opening externally: %s", url);
  }
  return { action: "deny" };
});
```

- Protocol check prevents `javascript:`, `data:`, `file:` schemes from reaching the OS
- `.catch()` handles the rejected promise for legitimate URLs that still fail
- Returns `{ action: "deny" }` synchronously as before

## 7. Files Changed

- `packages/desktop/src/main/core/browser-window-manager.ts` — Add URL validation and error handling to `setWindowOpenHandler`

## 8. Verification

1. [AC1] Click a link with no registered handler (e.g., a broken URL) — app must not crash
2. [AC2] Check logs for warning message when external URL fails to open
3. [AC3] Click a normal `https://` link — must open in default browser
4. [AC4] No error dialog or toast shown to user on failure
