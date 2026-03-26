# Reduce macOS Build CI Failures

## 1. Background

The `build-mac-dev (macos-15-intel, x64)` CI job fails intermittently due to transient network errors when downloading Electron binaries from GitHub Releases. This has occurred in 2 of the last 50 CI runs (runs 23576117210 and 23527251949), with different transient errors each time:

- DNS resolution failure: `dial tcp: lookup github.com: no such host`
- HTTP 502: `cannot resolve ...electron-v40.1.0-darwin-x64.zip: status code 502`

The failure rate is amplified by two compounding factors: redundant cross-architecture builds and absence of Electron binary caching.

## 2. Requirements Summary

**Goal:** Reduce the frequency of transient network failures in macOS CI build jobs.

**Scope:**

- In scope: electron-builder mac target config, Electron binary caching in CI
- Out of scope: `check` job failures (different root cause — code quality), publish workflow changes, Windows build caching (nice-to-have only)

## 3. Acceptance Criteria

1. The x64 CI job downloads and packages only x64 Electron (not arm64)
2. The arm64 CI job downloads and packages only arm64 Electron (not x64)
3. Electron binaries are cached across CI runs to reduce network dependency
4. The publish workflow continues to build correct per-arch artifacts (inherits config fix; verified by identical code path to CI)
5. Local dev builds produce artifacts for the host machine's native architecture

## 4. Problem Analysis

**Evidence from CI logs (run 23576117210, job `build-mac-dev (macos-15-intel, x64)`):**

The x64 job runs: `BUILD_ENV=dev bunx electron-builder --mac --x64 --config configs/electron-builder.mjs --publish=never`

Despite the `--x64` CLI flag, electron-builder packages BOTH architectures:

```
• packaging       platform=darwin arch=x64 electron=40.1.0 appOutDir=release/mac
• downloading     url=...electron-v40.1.0-darwin-x64.zip    ← succeeds
• building        target=macOS zip arch=x64
• building        target=DMG arch=x64
• packaging       platform=darwin arch=arm64 electron=40.1.0 appOutDir=release/mac-arm64
• downloading     url=...electron-v40.1.0-darwin-arm64.zip  ← DNS failure
⨯ Get "...electron-v40.1.0-darwin-arm64.zip": dial tcp: lookup github.com: no such host
```

**Root cause:** `electron-builder.mjs` lines 102-111 hardcode `arch: ["arm64", "x64"]` in each mac target definition. When `arch` is specified at the target level, it overrides the `--x64` CLI flag. Each matrix job ends up building both architectures, requiring 2 Electron binary downloads instead of 1.

**Failure multiplier math:**

- Current: 2 jobs x 2 downloads each = 4 network calls per CI run
- Fixed: 2 jobs x 1 download each = 2 network calls per CI run
- With caching: 0 network calls on cache hit (vast majority of runs)

**Approaches evaluated:**

- **A) Remove hardcoded `arch` from mac targets** -> Lets CLI `--arch` flag control build. Each job downloads 1 binary, not 2. Simple config change.
- **B) Add retry logic to CI workflow** -> Addresses symptom not cause. Adds workflow complexity. Still wastes time on redundant downloads.
- **C) Cache Electron binaries only** -> Helps on warm cache, but cold misses still hit 4 downloads. And the e2e job already caches Electron at `~/.cache/electron` (Linux path), but mac builds don't cache at all.
- **Chosen approach:** A + C combined. Remove redundant arch builds AND add caching. Eliminates the root cause and adds defense-in-depth.

**Note:** There is no top-level `mac.arch` set in the config (only per-target `arch`). The fix removes the per-target arrays only. Future developers should not re-add `arch` to the target definitions — the CI matrix + CLI flags are the intended mechanism for arch selection.

## 5. Decision Log

**1. How to prevent cross-architecture builds?**

- Options: A) Remove `arch` from config target objects · B) Dynamically set `arch` from env var · C) Use separate config files for CI vs local
- Decision: **A)** — Simplest. Without `arch` in the target config, electron-builder respects the CLI `--x64`/`--arm64` flag. For local dev without an explicit flag, it defaults to host native arch — correct behavior.

**2. What Electron cache path to use on macOS?**

- Options: A) `~/Library/Caches/electron` (macOS native) · B) `~/.cache/electron` (XDG/Linux convention)
- Decision: **A)** — electron-builder on macOS stores downloads at `~/Library/Caches/electron`. The e2e job uses `~/.cache/electron` because it runs on ubuntu-latest. Mac jobs need the macOS-native path.

**3. Cache key strategy?**

- Options: A) Hash `package.json` (like e2e job) · B) Explicit electron version string · C) Include `runner.arch` in key
- Decision: **A + C combined** — Use `hashFiles('packages/desktop/package.json')` for version sensitivity (same pattern as existing e2e job, changes when electron version bumps) AND include `runner.arch` to prevent arm64/x64 cache cross-contamination. Key: `electron-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('packages/desktop/package.json') }}`

**4. Should we also cache Electron in the Windows build job?**

- Options: A) Yes · B) No, out of scope
- Decision: **B)** — The Windows job has not shown this failure pattern. Can be added later if needed. Keep scope minimal.

**5. Should we also add caching to publish.yml?**

- Options: A) Yes · B) No
- Decision: **B)** — Publish.yml uses the same `electron-builder.mjs` config, so it benefits automatically from the arch fix (Decision 1). Adding Electron caching to publish.yml is deferred — it runs much less frequently (only on `v*` tags), but note that publish failures are higher-stakes (signed release artifacts). If transient failures occur there, add caching as a follow-up.

## 6. Design

### Change 1: Remove `arch` from mac target config

In `packages/desktop/configs/electron-builder.mjs`, change the mac target definition from:

```js
target: [
  { target: "dmg", arch: ["arm64", "x64"] },
  { target: "zip", arch: ["arm64", "x64"] },
],
```

To:

```js
target: ["dmg", "zip"],
```

When no `arch` is specified in the target config:

- CI with `--x64`: builds x64 only
- CI with `--arm64`: builds arm64 only
- Local dev with no flag: builds host native arch (Apple Silicon -> arm64, Intel -> x64)
- `beforePack` hook already reads `context.arch` dynamically for vendor binary downloads, so it continues to work correctly

### Change 2: Add Electron cache to macOS CI jobs

Add a cache step to the `build-mac-dev` job in `.github/workflows/ci.yml`, placed after "Setup bun" and before "Cache bun dependencies":

```yaml
- name: Cache Electron
  uses: actions/cache@v4
  with:
    path: ~/Library/Caches/electron
    key: electron-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('packages/desktop/package.json') }}
    restore-keys: |
      electron-${{ runner.os }}-${{ runner.arch }}-
```

The `runner.arch` (expands to `ARM64` or `X64` — uppercase) ensures arm64 and x64 runners maintain separate cache slots. Note: the matrix `arch` values are lowercase (`arm64`, `x64`) — a different format. The cache key intentionally uses `runner.arch` (a GitHub-provided context value) rather than the matrix value for consistency.

**Assumptions:** No `ELECTRON_CACHE` env var is set in the CI workflows or runner environment. If one is added later, the cache path must be updated to match. The existing e2e job's cache omits `runner.arch` because it always runs on `ubuntu-latest` (x64 only).

### Expected impact

- **Network calls per CI run:** 4 -> 2 (cache miss) or 0 (cache hit)
- **Failure probability:** Roughly halved on cache misses, eliminated on cache hits
- **Build speed:** Each job packages 1 arch instead of 2. Saves ~40s of packaging time per job (observed: electron download + packaging for the cross-arch target takes ~30-40s in logs)
- **Artifact correctness:** Unchanged — each matrix job already only uploads its own arch's artifact

## 7. Files Changed

- `packages/desktop/configs/electron-builder.mjs` — remove `arch` arrays from mac target objects
- `.github/workflows/ci.yml` — add Electron binary cache step to `build-mac-dev` job

## 8. Verification

1. [AC1, AC2] After config change, re-run CI and confirm each job's electron-builder log shows only one `• packaging` line (one arch, not two)
2. [AC3] Second CI run should show "Cache restored" for the Electron cache step
3. [AC4] Publish workflow uses the same config and same `--${{ matrix.arch }}` CLI pattern as CI. The fix is purely subtractive (removing config override). Risk is low; no separate dry-run needed.
4. [AC5] Run `electron-builder --mac` locally without `--arch` flag — should produce only native arch artifacts
