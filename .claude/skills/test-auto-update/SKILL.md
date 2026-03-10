---
name: test-auto-update
description: E2E test the Electron auto-updater with local builds, screen recording, and verification. Use when asked to "test auto update", "verify updater", or "record update demo". macOS only.
disable-model-invocation: true
---

# Test Auto-Update

E2E test the Electron auto-updater by building two local versions, serving the newer one via HTTP, launching the older one, and verifying the update flow. Record the screen as deliverable.

**Required skill:** Invoke `/electron` skill for agent-browser + Electron CDP workflow (launch, connect, snapshot, click, screenshot).

## Overview

The test proves that: app launches → auto-checks for update → downloads → shows toast → user can dismiss or restart → Squirrel.Mac applies update on next launch.

**All commands run from `packages/desktop/`** unless otherwise noted.

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-codesign.sh` | Create self-signed codesigning certificate (once per machine) |
| `scripts/set-version.ts` | Set version in package.json: `bun scripts/set-version.ts 0.1.0` |
| `scripts/highlight-button.js` | Inject click-flash effect on all `[data-testid]` buttons: `agent-browser eval "$(cat scripts/highlight-button.js)"` |
| `scripts/speed-video.sh` | Speed up recording with ffmpeg: `bash scripts/speed-video.sh /tmp/test-auto-update.mov 5` |

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

**If running locally (direct terminal session):** Add your terminal app in **System Settings → Privacy & Security → Screen Recording**.

**If running via SSH:** `screencapture -v` requires both a TCC grant AND a WindowServer connection. SSH sessions don't have WindowServer access, so you must bridge through `osascript → Terminal.app`. Do this one-time setup:

```bash
# 1. Grant screencapture TCC permission via the user TCC database
EPOCH=$(date +%s)
sqlite3 "$HOME/Library/Application Support/com.apple.TCC/TCC.db" \
  "INSERT OR REPLACE INTO access(service,client,client_type,auth_value,auth_reason,auth_version,indirect_object_identifier_type,indirect_object_identifier,flags,last_modified) \
   VALUES('kTCCServiceScreenCapture','com.apple.screencapture',0,2,4,1,0,'UNUSED',0,${EPOCH});"

# 2. Restart tccd to pick up the change
osascript -e 'do shell script "launchctl kickstart -k system/com.apple.tccd"' 2>/dev/null || true
sleep 3
```

**Key insight:** Use `client_type=0` (bundle ID) not `client_type=1` (path) — path-based entries are unreliable on macOS Sequoia.

Then use this wrapper for all `screencapture` calls (replaces direct invocation):
```bash
# Start recording via Terminal.app (Aqua session bridge)
# IMPORTANT: do NOT use "in window 1" — causes AppleEvent timeout if window is busy
# Opens a new Terminal window each time
/usr/bin/osascript -e 'tell application "Terminal" to do script "/usr/sbin/screencapture -V 90 /tmp/test-auto-update.mov 2>/tmp/rec.log; echo done:$? >>/tmp/rec.log"'
sleep 5  # wait for recording to actually start
pgrep screencapture && echo "recording started" || echo "FAILED to start"

# After recording finishes, close Terminal windows:
/usr/bin/osascript -e 'tell application "Terminal" to close every window'
```

**Critical:** `screencapture -V N` saves the file ONLY when the N-second timer expires naturally. SIGTERM and SIGINT do NOT save the file. Choose your duration carefully — do not kill screencapture early.

**Why this works:** Terminal.app runs in the Aqua/GUI session (WindowServer access). SSH sessions do not. `osascript → Terminal.app` bridges into that session. No `sudo` needed.

**Why not `launchctl bsexec` or `launchctl asuser`:** `bsexec` enters the right bootstrap namespace but runs as root — screencapture crashes as root on Sequoia. `asuser` changes launchd context but lacks full Aqua session. Combining them requires directory services unavailable inside `bsexec`. The Terminal.app bridge is simpler and confirmed working.

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

### 3.2 Start screen recording

Start recording **before** launching the app. Use `-V <seconds>` for timed recording.

**Local session:**
```bash
screencapture -V 90 /tmp/test-auto-update.mov &
```

**SSH session** (requires Phase 1.2 setup):
```bash
/usr/bin/osascript -e 'tell application "Terminal" to do script "/usr/sbin/screencapture -V 90 /tmp/test-auto-update.mov 2>/tmp/rec.log; echo done:$? >>/tmp/rec.log"'
sleep 5  # wait for recording to actually start
pgrep screencapture && echo "recording started" || echo "FAILED"
```

Verify recording started: `pgrep screencapture` must return a PID. The output file is only written after the timer expires — it will NOT exist while recording is in progress.

### 3.3 Launch the app and connect agent-browser

Invoke `/electron` skill, then follow its workflow to:

1. Launch: `open -a "Neovate Dev" --args --remote-debugging-port=9222`
2. Connect agent-browser to port 9222
3. Select the app window tab

### 3.4 Observe the update flow

The app auto-checks on launch. Expected sequence:
1. App detects v0.2.0 available (within a few seconds)
2. Toast appears with download progress
3. Toast changes to **"Update 0.2.0 ready"** with **Later** / **Restart** buttons

Use `agent-browser screenshot` to capture each state.

### 3.5 Test toast interactions

The toast buttons have `data-testid` attributes (`updater-later`, `updater-restart`). Inject a persistent highlight before clicking so it's visible in the recording:

```bash
env -u http_proxy -u https_proxy -u all_proxy agent-browser eval "$(cat .claude/skills/test-auto-update/scripts/highlight-button.js)"
```

On click: button scales up + red glow + outline (CSS transition, visible in recording). Targets all `[data-testid]` buttons at once.

Then click by `data-testid` selector:
```bash
# Click Later
env -u http_proxy -u https_proxy -u all_proxy agent-browser click '[data-testid="updater-later"]' 2>&1

# Click Restart
env -u http_proxy -u https_proxy -u all_proxy agent-browser click '[data-testid="updater-restart"]' 2>&1
```

Or click by snapshot ref (both work):
- **Click "Later"**: Toast dismisses, app continues running
- **Click "Restart"**: App quits and relaunches with new version

After the full flow, close any Terminal windows opened for recording:
```bash
/usr/bin/osascript -e 'tell application "Terminal" to close every window'
```

## Phase 4: Verify Update Applied

### 4.1 Quit and relaunch

```bash
osascript -e 'tell application "Neovate Dev" to quit'
sleep 2
open -a "Neovate Dev" --args --remote-debugging-port=9222
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

Clear Squirrel update caches (required for clean re-run — without this, the update is pre-downloaded and the download phase won't show):
```bash
rm -rf ~/Library/Caches/com.neovateai.desktop.dev.ShipIt/
rm -rf ~/Library/Caches/neovate-desktop-updater/
```

Kill the update server if still running.

## Verification Checklist

| # | Scenario | How to verify | Expected |
|---|----------|---------------|----------|
| 1 | Auto-check on launch | Launch v0.1.0 with update server running | Toast appears within seconds |
| 2 | Download progress | `agent-browser screenshot` during download | Shows "Downloading..." with progress bar |
| 3 | Update ready | `agent-browser screenshot` after download | Toast: "Update 0.2.0 ready" with Later / Restart |
| 4 | Dismiss toast | Click "Later" via agent-browser | Toast disappears, app keeps running |
| 5 | Restart to update | Click "Restart" via agent-browser | App quits, relaunches as v0.2.0 |
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
| agent-browser can't connect | App not launched with `--remote-debugging-port` | Quit app, relaunch with the flag |
| Port 9222 taken by Chrome | Port conflict | Use `--remote-debugging-port=9333` instead |
| `curl` / `agent-browser` hits proxy | `http_proxy` env var set | Prefix commands with `env -u http_proxy -u https_proxy -u all_proxy` |
| `screencapture -v` fails via SSH | SSH has no WindowServer connection | Use `osascript → Terminal.app` bridge (see Phase 1.2) |
| `screencapture` TCC permission unreliable | Used path-based entry (`client_type=1`) | Use bundle ID (`client_type=0`, `client='com.apple.screencapture'`) |
| screencapture exits with signal, no file saved | Killed with SIGTERM/SIGINT before timer expired | Let `-V N` timer expire naturally; do NOT `pkill screencapture` |
| `do script ... in window 1` causes AppleEvent timeout | Existing Terminal window has a running process | Remove `in window 1` — let osascript open a new window each time |
| Leftover Terminal windows | Recording opened new windows without cleanup | After recording: `osascript -e 'tell application "Terminal" to close every window'` |
| Invisible clicks in screen recording | CDP clicks have no visual cursor | Use `data-testid` selectors + inject persistent outline via `agent-browser eval` before clicking (see Phase 3.5) |
| `release/` overwritten mid-test | Built v0.2.0 after installing v0.1.0 from release/ | Install v0.1.0 to /Applications immediately after building it, before building v0.2.0 |
| App doesn't quit on "Restart" (macOS) | `win.on("close")` blocks quit | Fixed: `browser-window-manager.ts` checks `app.isQuiting` before preventing close |
| `quitAndInstall()` silently does nothing | Squirrel.Mac native updater doesn't quit app | Fixed: `setTimeout(() => app.quit(), 3000)` fallback in `service.ts` |
| App relaunches without CDP port | Squirrel launched it directly | Kill and relaunch manually: `pkill -f "Neovate Dev" && open -a "Neovate Dev" --args --remote-debugging-port=9333` |

## Key Behaviors

- **Squirrel.Mac auto-applies**: Downloaded updates apply on next launch, no user action needed
- **autoDownload = false**: `UpdaterService` calls `downloadUpdate()` explicitly after detecting availability, so the toast can show progress
- **State guards**: `check()` is no-op when status is `checking` / `downloading` / `available` / `ready`
- **dev-app-update.yml**: In dev mode, electron-updater reads this file (points to `http://localhost:8080`) instead of the packaged `app-update.yml`
- **app.isQuiting flag**: Must be set in `before-quit` handler so `win.on("close")` allows windows to close during quit; without this, `quitAndInstall()` is silently blocked on macOS
- **`later` button**: Only sets local React state (`setDismissed(true)`), does not persist — toast reappears on next launch
- **`cp -R src dest`**: When dest already exists, copies INTO it instead of replacing; always `rm -rf dest` first when reinstalling
- **screencapture saves on expiry only**: `-V N` writes the file when the N-second timer runs out. SIGTERM and SIGINT both exit without saving. Size the duration to match your flow.
- **Terminal.app `in window 1` is fragile**: If the window already has a running process, `do script ... in window 1` causes an AppleEvent timeout (-1712). Always use `do script "..."` without a window target.
- **Don't modify production code for demo purposes**: For visible click effects, inject temporary CSS via `agent-browser evaluate`. Don't add animations or debug UI to app code.
- **`release/` is shared**: Both v0.1.0 and v0.2.0 builds write to the same `release/` dir. Install v0.1.0 to /Applications before building v0.2.0 to avoid overwriting it.

## Post-Processing

### Speed up the recording

```bash
ffmpeg -i /tmp/test-auto-update.mov \
  -vf "setpts=0.2*PTS" \
  -af "atempo=2.0,atempo=2.0,atempo=1.25" \
  -c:v libx264 -preset fast -crf 22 \
  /tmp/test-auto-update-5x.mp4 -y
open /tmp/test-auto-update-5x.mp4
```

`setpts=0.2*PTS` = 5x video speed. `-af atempo` chain = 5x audio (atempo max is 2.0 per filter, so chain: 2×2×1.25 = 5).

## Deliverable

Screen recording file (e.g., `test-auto-update-5x.mp4`) showing the full update flow. Deliver to reviewer for visual verification.
