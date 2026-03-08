---
name: test-auto-update
description: E2E test the Electron auto-updater with local builds and screen recording. Use when asked to "test auto update", "verify updater", or "record update demo". Must be invoked manually via /test-auto-update.
---

# Test Auto-Update

E2E testing workflow for the Electron auto-updater. Produces a screen recording as deliverable.

## Prerequisites

- macOS with `codesign`, `screencapture`, `security` CLI tools
- `bun` package manager
- Self-signed codesigning certificate (see One-Time Setup)

## One-Time Setup: Self-Signed Certificate

Run the setup script to create a codesigning certificate. Only needed once per machine.

```bash
bash .claude/skills/test-auto-update/scripts/setup-codesign.sh
```

Verify with:

```bash
security find-identity -p codesigning | grep "Neovate Local Code Sign"
```

### Troubleshooting

| Problem | Fix |
|---------|-----|
| `MAC verification failed` during import | Script uses `-legacy` flag, should be handled |
| Cert not in `find-identity` output | `security add-trusted-cert -p codeSign` on the .pem |
| Multiple certs with same name | Delete duplicates: `security delete-certificate -Z <sha1-hash>` |
| `errSecInternalComponent` | `security unlock-keychain ~/Library/Keychains/login.keychain-db` |

## Automated Test with Recording

Run from the project root:

```bash
bun .claude/skills/test-auto-update/scripts/test-auto-update.ts --record --record-duration 30
```

The script:
1. Builds v0.1.0, installs to `/Applications`
2. Builds v0.2.0 as update payload
3. Starts local update server (port 8080)
4. Starts screen recording
5. Launches v0.1.0 app
6. Waits for auto-update (download + ready toast)
7. Stops recording, quits and relaunches to verify update applied
8. Restores `package.json` to original version

| Flag | Default | Description |
|------|---------|-------------|
| `--record` | false | Record screen during test |
| `--old-version` | 0.1.0 | "Current" version |
| `--new-version` | 0.2.0 | "Update" version |
| `--record-duration` | 30 | Recording seconds |
| `--output` | test-auto-update.mov | Output file |

## Manual Test

When interaction with toast buttons is needed, run all commands from `packages/desktop/`:

**1. Build and install old version:**
```bash
# Set version to 0.1.0 in package.json, then:
bun run package:local
cp -R "release-dev/mac-arm64/Neovate Dev.app" "/Applications/Neovate Dev.app"
```

**2. Build new version:**
```bash
# Set version to 0.2.0 in package.json, then:
bun run package:local
```

**3. Start server and recording:**
```bash
# Terminal 1:
bun run scripts/dev-app-update-server.ts

# Terminal 2 (optional):
screencapture -v -V30 -C test-auto-update.mov
```

**4. Launch and observe:**
```bash
open "/Applications/Neovate Dev.app"
```

**5. Verify after quit+relaunch:**
```bash
defaults read "/Applications/Neovate Dev.app/Contents/Info" CFBundleShortVersionString
# Expected: 0.2.0
```

**6. Clean up:**
```bash
rm -rf "/Applications/Neovate Dev.app" release-dev/
# Reset package.json version
```

## Verification Checklist

| Scenario | Expected |
|----------|----------|
| Auto-check on launch | Detects new version within seconds |
| Download progress | Toast shows progress bar |
| Update ready | Toast: "Update X.X.X ready" with Later / Restart |
| Click "Later" | Toast dismisses |
| Click "Restart" | App quits and relaunches updated |
| Relaunch without Restart | Squirrel.Mac applies update on next launch |

## Key Behaviors

- **Squirrel.Mac auto-applies**: Downloaded updates apply on next launch even without "Restart"
- **autoDownload = false**: Explicit `downloadUpdate()` call allows toast to show progress
- **State guards**: `check()` is no-op during checking/downloading/available/ready

## Deliverable

The `test-auto-update.mov` screen recording captures the full update flow. Deliver to reviewer for visual verification.
