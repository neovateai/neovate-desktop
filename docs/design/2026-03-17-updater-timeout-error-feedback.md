# Update Timeout + About Panel Error Feedback

## Problem

1. **No timeout on update check**: `UpdaterService.check()` calls `autoUpdater.checkForUpdates()` with no timeout. If the update server is unreachable, the UI stays stuck in "checking" state indefinitely and `isChecking` remains `true`, blocking all future check attempts (both manual and hourly interval).

2. **No error feedback in about panel**: Version fetches (`getVersion`, `getClaudeCodeSDKVersion`) silently fail, leaving empty strings. The `client.updater.check()` IPC call has no `.catch()`, so IPC-level failures produce no user feedback.

## Design

### 1. Check timeout — `src/main/features/updater/service.ts`

- Define `CHECK_TIMEOUT_MS = 30_000` constant (consistent with existing `CHECK_INTERVAL_MS` naming)
- Add a `setTimeout` using `CHECK_TIMEOUT_MS` after calling `autoUpdater.checkForUpdates()` in the `check()` method
- Store the timer ID in a private field (`private checkTimeout: ReturnType<typeof setTimeout> | null = null`)
- If the timer fires: set `isChecking = false`, and if `surfaceUI` is true, call `setState({ status: "error", message: "TIMEOUT" })` (sentinel value — see i18n section below)
- Extract a private `clearCheckTimeout()` helper to avoid repeating `clearTimeout` + null assignment in 4 places
- Call `clearCheckTimeout()` in every electron-updater event handler (`update-available`, `update-not-available`, `error`) and in `dispose()`
- **Auto-recovery**: In `update-not-available` and `update-available` handlers, if current state is `"error"`, clear it regardless of `surfaceUI` — this ensures a successful background check after a timeout auto-clears the stale error

**Scope**: Check only. Download timeout not needed — electron-updater already emits error events for download failures, and download duration varies by connection speed.

### 2. Version fetch fallback — `src/renderer/src/features/settings/components/panels/about-panel.tsx`

- Add `.catch()` to both `client.updater.getVersion()` and `client.updater.getClaudeCodeSDKVersion()`
- On failure, set the version to `t("settings.about.unknownVersion")` (e.g. `"Unknown"`) instead of leaving it as empty string

### 3. Check IPC error handling — `src/renderer/src/features/settings/components/panels/about-panel.tsx`

- Add `.catch()` to `client.updater.check()` in `handleCheckForUpdates`
- On rejection, set a local error state (`const [checkError, setCheckError] = useState<string | null>(null)`)
- Display `checkError` as red text in the update row (same style as existing `state.status === "error"` display)
- Clear `checkError` at the start of each new check attempt
- **Error precedence**: Show `checkError` only when `state.status !== "error"` — subscription errors (timeout, electron-updater) take priority over the local IPC error
- **Auto-clear on subscription activity**: Clear `checkError` whenever a new subscription event arrives (meaning IPC has recovered)

### 4. i18n for timeout message

- The service emits `"TIMEOUT"` as the error message sentinel (not a user-facing English string)
- In the about panel, map the sentinel to a translated string: if `state.message === "TIMEOUT"`, display `t("settings.about.checkTimeout")` instead of the raw message
- Other error messages (from electron-updater) pass through as-is — these are English-only, consistent with current behavior
- Add the `settings.about.checkTimeout` key to i18n resources (e.g. `"Update check timed out"`)
- Add the `settings.about.unknownVersion` key to i18n resources (e.g. `"Unknown"`) — used by version fetch fallback in section 2

## Files Changed

| File                                                                   | Change                                                                                          |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/main/features/updater/service.ts`                                 | Add 30s timeout with `clearCheckTimeout()` helper, auto-recovery on background success          |
| `src/renderer/src/features/settings/components/panels/about-panel.tsx` | `.catch()` on version fetches, `.catch()` on check IPC, error precedence logic, TIMEOUT mapping |
| i18n resources                                                         | Add `settings.about.checkTimeout` and `settings.about.unknownVersion` keys                      |

No contract, type, or hook changes needed. The timeout error flows through the existing `UpdaterState` error status via the subscription.

## Known Edge Cases

**Late event race condition**: If the timeout fires and the user immediately starts a new check, a late `update-not-available` from the _first_ check could clear the new check's timeout and set `isChecking = false` prematurely. This is a pre-existing limitation of electron-updater being a singleton — there's no way to correlate events with specific `checkForUpdates()` calls. The timeout makes it slightly more observable but doesn't introduce it. Not worth solving (would require a generation counter or wrapper) given how unlikely the timing is.
