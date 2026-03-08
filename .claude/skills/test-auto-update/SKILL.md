---
name: test-auto-update
description: E2E test the Electron auto-updater with local builds and screen recording. Use when asked to "test auto update", "verify updater", or "record update demo". Must be invoked manually via /test-auto-update.
---

# Test Auto-Update

E2E testing workflow for the Electron auto-updater on macOS. Builds two versions locally, serves the newer one via a local HTTP server, launches the older one, and verifies the auto-update flow. Optionally records the screen as a deliverable.

## Prerequisites

- **macOS** (Squirrel.Mac is the update mechanism, this test does not work on other platforms)
- **bun** installed globally
- **Dependencies installed**: Run `bun install` from the repo root before testing
- **macOS Screen Recording permission** (only for `--record`): The terminal app (Terminal.app, iTerm2, etc.) must have Screen Recording permission in System Settings > Privacy & Security > Screen Recording. macOS will prompt on first use.

## One-Time Setup: Self-Signed Certificate

The local build needs codesigning. Create a self-signed certificate in the login keychain (only once per machine):

```bash
bash .claude/skills/test-auto-update/scripts/setup-codesign.sh
```

This script:
1. Creates a self-signed certificate with Code Signing EKU via openssl
2. Imports it into `~/Library/Keychains/login.keychain-db`
3. Trusts it for code signing via `security add-trusted-cert`
4. Verifies it appears in `security find-identity -p codesigning`

The certificate name must match the `LOCAL_UPDATE_SIGN_IDENTITY` in `configs/electron-builder.local.mjs` (default: `"Neovate Local Code Sign"`).

Verify it exists:

```bash
security find-identity -p codesigning | grep "Neovate Local Code Sign"
```

### Troubleshooting Certificate Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| `MAC verification failed` during PKCS12 import | openssl 3.x changed default encryption | Script already uses `-legacy` flag |
| Certificate not in `find-identity` output | Not trusted for code signing | `security add-trusted-cert -p codeSign -k ~/Library/Keychains/login.keychain-db cert.pem` |
| Multiple certs with same name | Ran setup script multiple times | Delete duplicates: `security delete-certificate -Z <sha1-hash> -k ~/Library/Keychains/login.keychain-db` |
| `errSecInternalComponent` during codesign | Keychain locked | `security unlock-keychain ~/Library/Keychains/login.keychain-db` |

## Repo Files Involved

The following files in `packages/desktop/` are part of the testing infrastructure:

| File | Purpose |
|------|---------|
| `configs/electron-builder.local.mjs` | electron-builder config for local testing (self-signed, generic provider, `release/` output) |
| `scripts/dev-app-update-server.ts` | HTTP server serving `release/` on port 8080 |
| `dev-app-update.yml` | electron-updater dev config pointing to `http://localhost:8080` |
| `package.json` → `package:local` script | Shorthand for building with the local config |

## Automated Test

Run from the repo root:

```bash
bun .claude/skills/test-auto-update/scripts/test-auto-update.ts
```

With screen recording:

```bash
bun .claude/skills/test-auto-update/scripts/test-auto-update.ts --record --record-duration 30 --output test-auto-update.mov
```

### What the script does

1. Quits any running "Neovate Dev" instance
2. Sets `package.json` version to `--old-version` (default: 0.1.0)
3. Runs `bun run package:local` → builds and codesigns into `release/`
4. Copies `release/mac-arm64/Neovate Dev.app` to `/Applications/`
5. Sets `package.json` version to `--new-version` (default: 0.2.0)
6. Runs `bun run package:local` again → overwrites `release/` with new version
7. Starts `scripts/dev-app-update-server.ts` serving `release/` on port 8080
8. (If `--record`) Starts `screencapture -v -V<duration> -C <output>`
9. Launches the v0.1.0 app from `/Applications/`
10. Waits for recording to finish (or 20s if no recording)
11. Quits app, relaunches to let Squirrel.Mac apply update, checks version
12. Cleans up: quits app, kills server, **restores `package.json`** to original content

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `--record` | false | Record screen via macOS `screencapture` |
| `--old-version` | 0.1.0 | Version installed as "current" |
| `--new-version` | 0.2.0 | Version served as update |
| `--record-duration` | 30 | Recording duration in seconds |
| `--output` | test-auto-update.mov | Output video file path |

### Expected output

```
=== Step 2: Build v0.1.0 ===
...
=== Step 3: Install v0.1.0 to /Applications ===
Installed version: 0.1.0
=== Step 4: Build v0.2.0 (update payload) ===
...
=== Step 5: Start local update server ===
Update server is running on port 8080
=== Step 7: Launch v0.1.0 ===
App launched. Auto-update should detect and download the new version.
...
=== Step 9: Verify ===
Installed version after update: 0.2.0

SUCCESS: App updated from 0.1.0 to 0.2.0
```

## Manual Test

When interaction with toast buttons is needed (e.g. clicking "Later" or "Restart"), follow these steps from `packages/desktop/`:

**1. Build and install old version:**
```bash
# Edit package.json: set "version": "0.1.0"
bun run package:local
cp -R "release/mac-arm64/Neovate Dev.app" "/Applications/Neovate Dev.app"
```

**2. Build new version (update payload):**
```bash
# Edit package.json: set "version": "0.2.0"
bun run package:local
```

**3. Start update server:**
```bash
bun run scripts/dev-app-update-server.ts
# Verify: curl http://localhost:8080/latest-mac.yml
```

**4. (Optional) Start screen recording:**
```bash
screencapture -v -V30 -C test-auto-update.mov
```

**5. Launch the old version:**
```bash
open "/Applications/Neovate Dev.app"
```

**6. Observe the update flow:**
- Auto-check triggers on launch → detects v0.2.0
- Toast appears showing download progress
- Toast changes to "Update 0.2.0 ready" with **Later** / **Restart** buttons
- Click buttons to test interaction

**7. Verify Squirrel.Mac auto-apply (after quit+relaunch):**
```bash
osascript -e 'tell application "Neovate Dev" to quit'
sleep 2
open "/Applications/Neovate Dev.app"
defaults read "/Applications/Neovate Dev.app/Contents/Info" CFBundleShortVersionString
# Expected: 0.2.0
```

**8. Clean up:**
```bash
rm -rf "/Applications/Neovate Dev.app"
# Reset package.json version back to original
```

## Verification Checklist

| Scenario | Expected |
|----------|----------|
| Auto-check on launch | Detects new version within seconds |
| Download progress | Toast shows "Downloading X.X.X..." with progress bar |
| Update ready | Toast: "Update X.X.X ready" with Later / Restart |
| Click "Later" | Toast dismisses, app continues normally |
| Click "Restart" | App quits and relaunches with new version |
| Quit+relaunch (no click) | Squirrel.Mac applies downloaded update on next launch |

## Key Behaviors

- **Squirrel.Mac auto-applies**: Downloaded updates are applied on next app launch even without clicking "Restart". This is native macOS Squirrel behavior, not controlled by the app.
- **autoDownload = false**: The `UpdaterService` sets `autoUpdater.autoDownload = false`, then explicitly calls `downloadUpdate()` after detecting availability. This allows the toast to show download progress.
- **State machine guards**: `check()` is a no-op when status is `checking`, `downloading`, `available`, or `ready` — prevents duplicate concurrent checks.
- **dev-app-update.yml**: When running in dev mode (not packaged via `electron-vite dev`), electron-updater uses this file instead of the packaged `app-update.yml`. It points to `http://localhost:8080`.

## Deliverable

The `test-auto-update.mov` screen recording captures the full update flow from app launch through toast display to version verification. Deliver this file to the reviewer for visual verification.
