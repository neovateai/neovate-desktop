---
name: test-auto-update
description: E2E test the Electron auto-updater with local builds, screen recording, and verification. Use when asked to "test auto update", "verify updater", or "record update demo". macOS only.
---

# Test Auto-Update

E2E test the Electron auto-updater by building two local versions, serving the newer one via HTTP, launching the older one, and verifying the update flow. Record the screen as deliverable.

## Overview

The test proves that: app launches → auto-checks for update → downloads → shows toast → user can dismiss or restart → Squirrel.Mac applies update on next launch.

**All commands run from `packages/desktop/`** unless otherwise noted.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-codesign.sh` | Create self-signed codesigning certificate (once per machine) |
| `scripts/set-version.ts` | Set version in package.json: `bun scripts/set-version.ts 0.1.0` |

Scripts are located at `.claude/skills/test-auto-update/scripts/` relative to repo root.

## Phase 1: One-Time Machine Setup

### 1.1 Create codesigning certificate

```bash
bash .claude/skills/test-auto-update/scripts/setup-codesign.sh
```

**Verify:**
```bash
security find-identity -p codesigning | grep "Neovate Local Code Sign"
```
Must show one valid identity. If it shows multiple, delete duplicates with `security delete-certificate -Z <sha1-hash>`.

### 1.2 Grant Screen Recording permission (for recording)

The terminal app must have Screen Recording permission in **System Settings → Privacy & Security → Screen Recording**. macOS prompts on first `screencapture -v` use.

## Phase 2: Build Test Versions

### 2.1 Build the "old" version (e.g., 0.1.0)

```bash
bun .claude/skills/test-auto-update/scripts/set-version.ts 0.1.0
cd packages/desktop && bun run package:local
```

**Verify:** `release/mac-arm64/Neovate Dev.app` exists. Check version:
```bash
defaults read "$(pwd)/release/mac-arm64/Neovate Dev.app/Contents/Info" CFBundleShortVersionString
```
Must output `0.1.0`.

### 2.2 Install old version

```bash
cp -R "release/mac-arm64/Neovate Dev.app" "/Applications/Neovate Dev.app"
```

**Verify:**
```bash
defaults read "/Applications/Neovate Dev.app/Contents/Info" CFBundleShortVersionString
```
Must output `0.1.0`.

### 2.3 Build the "new" version (e.g., 0.2.0)

```bash
bun .claude/skills/test-auto-update/scripts/set-version.ts 0.2.0
cd packages/desktop && bun run package:local
```

**Verify:** `release/latest-mac.yml` contains `version: 0.2.0`.

## Phase 3: Run the Test

### 3.1 Start local update server

```bash
cd packages/desktop && bun run scripts/dev-app-update-server.ts
```

Run in background. **Verify:**
```bash
curl -s http://localhost:8080/latest-mac.yml | head -3
```
Must show `version: 0.2.0`.

### 3.2 Start screen recording (optional)

```bash
screencapture -v -V30 -C test-auto-update.mov
```

`-V30` records for 30 seconds. Adjust as needed. Start this **before** launching the app.

### 3.3 Launch the app with CDP enabled

Launch with `ELECTRON_CDP_PORT` so agent-browser can connect for UI interaction:

```bash
ELECTRON_CDP_PORT=9223 "/Applications/Neovate Dev.app/Contents/MacOS/Neovate Dev" &
```

**Note:** Do NOT use `open` — it doesn't forward environment variables to the app process.

**Verify CDP is available:**
```bash
curl -s http://localhost:9223/json/version | head -1
```

### 3.4 Connect agent-browser

```bash
agent-browser connect http://localhost:9223
```

Then select the app's main window tab:
```bash
agent-browser tab
agent-browser tab <n>
```

### 3.5 Observe the update flow

The app auto-checks on launch. Expected sequence:
1. App detects v0.2.0 available (within a few seconds)
2. Toast appears with download progress
3. Toast changes to **"Update 0.2.0 ready"** with **Later** / **Restart** buttons

Use `agent-browser screenshot` to capture each state for verification.

### 3.6 Test toast interactions via agent-browser

- **Click "Later"**: `agent-browser click "Later"` — Toast dismisses, app continues running
- **Click "Restart"**: `agent-browser click "Restart"` — App quits and relaunches with new version

## Phase 4: Verify Update Applied

### 4.1 Quit and relaunch

```bash
osascript -e 'tell application "Neovate Dev" to quit'
sleep 2
ELECTRON_CDP_PORT=9223 "/Applications/Neovate Dev.app/Contents/MacOS/Neovate Dev" &
```

### 4.2 Check version

```bash
defaults read "/Applications/Neovate Dev.app/Contents/Info" CFBundleShortVersionString
```

Must output `0.2.0`. Squirrel.Mac applies downloaded updates on next launch even without clicking "Restart".

## Phase 5: Cleanup

```bash
osascript -e 'tell application "Neovate Dev" to quit'
rm -rf "/Applications/Neovate Dev.app"
```

Restore package.json version:
```bash
bun .claude/skills/test-auto-update/scripts/set-version.ts 0.0.0
```

Kill the update server if still running.

## Verification Checklist

| # | Scenario | How to verify | Expected |
|---|----------|---------------|----------|
| 1 | Auto-check on launch | Launch v0.1.0 with update server running | Toast appears within seconds |
| 2 | Download progress | `agent-browser screenshot` during download | Shows "Downloading..." with progress bar |
| 3 | Update ready | `agent-browser screenshot` after download | Toast: "Update 0.2.0 ready" with Later / Restart |
| 4 | Dismiss toast | `agent-browser click "Later"` | Toast disappears, app keeps running |
| 5 | Restart to update | `agent-browser click "Restart"` | App quits, relaunches as v0.2.0 |
| 6 | Auto-apply on relaunch | Quit app (without clicking Restart), relaunch | `CFBundleShortVersionString` is `0.2.0` |

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| `MAC verification failed` during cert import | openssl 3.x default encryption | setup-codesign.sh already uses `-legacy` flag |
| Cert not in `find-identity` | Not trusted for code signing | `security add-trusted-cert -p codeSign` |
| Multiple certs same name | Ran setup multiple times | `security delete-certificate -Z <hash>` |
| `errSecInternalComponent` | Keychain locked | `security unlock-keychain ~/Library/Keychains/login.keychain-db` |
| Toast doesn't appear | Update server not running or wrong version | Check `curl http://localhost:8080/latest-mac.yml` |
| No update detected | App version >= server version | Ensure installed app is v0.1.0, server has v0.2.0 |
| codesign fails silently | Identity name mismatch | `LOCAL_UPDATE_SIGN_IDENTITY` env var or check `electron-builder.local.mjs` |
| agent-browser can't connect | App not launched with `ELECTRON_CDP_PORT` | Must use direct binary launch, not `open` |

## Key Behaviors

- **Squirrel.Mac auto-applies**: Downloaded updates apply on next launch, no user action needed
- **autoDownload = false**: `UpdaterService` calls `downloadUpdate()` explicitly after detecting availability, so the toast can show progress
- **State guards**: `check()` is no-op when status is `checking` / `downloading` / `available` / `ready`
- **dev-app-update.yml**: In dev mode, electron-updater reads this file (points to `http://localhost:8080`) instead of the packaged `app-update.yml`
- **CDP via env var**: Set `ELECTRON_CDP_PORT=9223` when launching to enable agent-browser access

## Deliverable

Screen recording file (e.g., `test-auto-update.mov`) showing the full update flow. Deliver to reviewer for visual verification.
