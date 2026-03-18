# Startup Performance Optimization

## Problem

App startup has excessive re-renders in the sidebar session list during initialization.

## Bottlenecks Identified

1. **Shell env resolution (~300-1200ms)** — Spawns interactive login shell every launch. Varies by system load.
2. **loadSessionPreferences re-render storm** — Called 6x (per-project) but loads identical global data; `_projectPath` param unused. Causes 42 IPC calls and 88 `pinned-session-list` renders.
3. **listSessions N+1 stats (~500-670ms)** — 821 `statSync()` calls for birthtimes after SDK already scanned dirs.
4. **Code-server hardcoded delay (1000ms)** — `await delay(1000)` FIXME in `starter.ts:33`.
5. **Terminal double-spawn (~130ms waste)** — React StrictMode (dev only).

## Decision Log

**1. Shell env resolution**

- Options: A) Cache env to disk B) Use non-interactive shell C) Accept the cost
- Decision: **C) Accept** — Attempted disk cache (Fix 1). A/B testing showed shell-env resolution time varies widely (272ms-1228ms) depending on system load, not fixable by caching. The cache added complexity without consistent benefit. Reverted.

**2. loadSessionPreferences re-render storm**

- Options: A) Call once instead of per-project B) Add a batch endpoint C) Debounce store updates
- Decision: **A) Call once** — The function already ignores `_projectPath` and loads global data. Remove the loop, call once. Zero new endpoints, maximum impact.

**3. listSessions N+1 stats**

- Options: A) Cache birthtimes to disk B) Skip birthtimes, use SDK's lastModified C) Use async stat
- Decision: **C was attempted, reverted** — Birthtime disk cache + async stat added overhead (JSON parse of 827 entries, `Promise.allSettled` machinery) that made warm-start performance _worse_ (673ms vs 499ms). The sync `statSync` loop is already fast enough on macOS. Reverted.

**4. Code-server 1s delay**

- Decision: **Leave as-is** — Not on critical path (background). FIXME comment indicates known issue.

**5. Terminal double-spawn**

- Decision: **Accept** — Dev-only (React StrictMode). Component already handles cleanup correctly.

## Fix Implemented

### Deduplicate loadSessionPreferences

`loadSessionPreferences(_projectPath)` ignored its parameter — it calls 3 global endpoints (`getArchivedSessions`, `getPinnedSessions`, `getClosedAccordions`). The `MultiProjectSessionList` effect looped through all 6 projects calling it N times. Fixed: call once, removed unused param.

- Files: `src/renderer/src/features/agent/components/session-list.tsx`, `src/renderer/src/features/project/store.ts`

## Measured Results (A/B test, same machine, same session data)

| Metric                              | Before | After | Change |
| ----------------------------------- | ------ | ----- | ------ |
| `loadSessionPreferences` calls      | 42     | 12    | -71%   |
| `session preferences loaded` events | 36     | 6     | -83%   |
| `pinned-session-list` renders       | 88     | 28    | -68%   |

End-to-end startup time was similar (~2.5s) because `listSessions` dominates, but the renderer does significantly less wasted work during initialization.
