# Interceptor: Provider URL Matching Fix

**Date:** 2026-03-18
**Status:** Draft

## Problem

The network interceptor fails to capture API requests when using a custom provider (e.g., `zenmux`). The 403 error response is visible in the chat UI but never appears in the Network panel.

## Root Cause

The interceptor's `isAnthropicURL()` function decides whether to capture a fetch call. It checks:

1. Hostname contains `anthropic` or `claude`
2. Path starts with `/v1/messages` or `/api/eval/sdk-`
3. Hostname+port matches `process.env.ANTHROPIC_BASE_URL`

For custom providers, the URL is something like `https://api.zenmux.com/...` — hostname doesn't match check 1. Path might match check 2, but only if the provider URL doesn't include a path prefix (e.g., `https://gateway.example.com/proxy/anthropic/v1/messages` would fail).

Check 3 fails because the provider's `ANTHROPIC_BASE_URL` is set via the SDK's `options.settings.env` (flag settings layer), not in the spawned process's `process.env`. The spawn wrapper only passes:

```typescript
env: { ...spawnOpts.env, NV_SESSION_ID: sessionId }
```

If the SDK doesn't merge `settings.env` into `spawnOpts.env`, the interceptor's `process.env.ANTHROPIC_BASE_URL` is empty.

## Evidence

From `/tmp/dev.log` (session `48bb0629`, provider `zenmux`):

```
09:12:40.496  interceptor ready: sessionId=48bb0629
09:12:42.823  startTurn: sid=48bb0629 turn=1
              (no onMessage after this — interceptor didn't capture the request)
09:12:54.336  updater check timed out (end of log)
```

The interceptor loaded successfully (ready handshake received), but `isAnthropicURL()` returned false for the provider's URL, so the request passed through uncaptured.

## Fix

Two changes, in priority order:

### 1. Header-based matching with URL-first fast path (primary fix)

**File:** `packages/desktop/src/main/features/agent/interceptor/fetch-interceptor.ts`

The Anthropic SDK always sends `anthropic-version` and/or `x-api-key` headers on every API request, regardless of the base URL. Add a header-based check as a fallback when URL matching fails.

**Case-insensitive header matching:** `extractHeaders()` only normalizes keys to lowercase when the input is a `Headers` instance (`.forEach` yields lowercase). When the SDK passes a plain object, original casing is preserved (`"Anthropic-Version"`, `"X-Api-Key"`). The check must be case-insensitive:

```typescript
function hasAnthropicHeaders(headers: Record<string, string>): boolean {
  for (const key of Object.keys(headers)) {
    const lower = key.toLowerCase();
    if (lower === "anthropic-version" || lower === "x-api-key") return true;
  }
  return false;
}
```

**URL-first, headers as fallback:** Most requests are non-Anthropic (npm, web fetches). Extracting headers on every fetch call is unnecessary overhead. Check URL first (fast path), only extract+check headers when URL doesn't match:

```typescript
// Before:
if (!ipcAlive || !isAnthropicURL(url)) {
  return originalFetch.apply(this, arguments as any);
}

// After:
if (!ipcAlive) {
  return originalFetch.apply(this, arguments as any);
}

// Fast path: URL matches known Anthropic patterns
if (!isAnthropicURL(url)) {
  // Slow path: custom provider URL — check for Anthropic-specific headers
  if (!hasAnthropicHeaders(extractHeaders(init))) {
    return originalFetch.apply(this, arguments as any);
  }
}
```

This keeps the hot path (non-Anthropic fetches) fast — no header extraction. Only custom provider URLs pay the header check cost.

### 2. Pass provider base URL in spawn env (defense-in-depth)

**File:** `packages/desktop/src/main/features/agent/session-manager.ts`

Pass the provider's `ANTHROPIC_BASE_URL` from `settingsEnv` into the spawn env so the interceptor's `customBaseURL` matching also works:

```typescript
// Before:
env: { ...spawnOpts.env, NV_SESSION_ID: sessionId },

// After:
env: {
  ...spawnOpts.env,
  NV_SESSION_ID: sessionId,
  ...(settingsEnv?.ANTHROPIC_BASE_URL
    ? { ANTHROPIC_BASE_URL: settingsEnv.ANTHROPIC_BASE_URL }
    : {}),
},
```

The `settingsEnv` variable is already in scope (captured from the outer `initSession` closure). This makes the URL-based `customBaseURL` check work as a secondary match and provides accurate URL display in the Network panel.

Note: if `spawnOpts.env` already contains `ANTHROPIC_BASE_URL` (SDK passes it through), this is a no-op since the spread order puts `settingsEnv` value last. If it doesn't, this fills the gap.

## Scope

| File                   | Change                                                                                        |
| ---------------------- | --------------------------------------------------------------------------------------------- |
| `fetch-interceptor.ts` | Add `hasAnthropicHeaders()` with case-insensitive check, URL-first guard with header fallback |
| `session-manager.ts`   | Pass `settingsEnv.ANTHROPIC_BASE_URL` in spawn env                                            |

Rebuild interceptor bundle after changes: `bun scripts/build-interceptor.ts`
