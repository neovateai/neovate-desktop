# Fix Official Marketplace

## Problem

The "Add Official Marketplace" button in the plugins discover tab doesn't work. Three bugs identified:

1. **Silent error swallowing** — `discover-tab.tsx` `handleAddOfficial` has no `catch` block. Errors are silently swallowed, user sees spinner then nothing.
2. **No idempotency** — `addMarketplace` in `plugins-service.ts` runs `gitClone` which fails if the destination directory already exists (e.g. from a previous failed attempt).
3. **GitHub shorthand not expanded** — `gitCloneSubdir` in `git-utils.ts` doesn't expand GitHub shorthand URLs (e.g. `"techwolf-ai/ai-first-toolkit"`) to full `https://github.com/...` URLs. This breaks plugin install for ~5 official marketplace plugins that use the `git-subdir` source type with shorthand.

The official marketplace repo (`https://github.com/anthropics/claude-plugins-official`) exists and has the correct structure (`.claude-plugin/marketplace.json` with ~90 plugins). The data layer code matches the repo structure — the bugs are in error handling, idempotency, and URL expansion.

## Changes

### 1. `src/renderer/src/features/claude-code-plugins/components/discover-tab.tsx`

Add error toast and concurrent click guard to `handleAddOfficial`:

- Import `toastManager` from `../../../components/ui/toast`
- Add early return `if (addingOfficial) return;` at the top of `handleAddOfficial` as a concurrent click guard (the button is `disabled={addingOfficial}` but there's a tiny race window before React re-renders)
- Add `catch` block: `toastManager.add({ type: "error", title: t("settings.plugins.officialMarketplaceError"), description: e.message })`
- No success toast — when the marketplace is added, `onRefresh()` repopulates data and the UI transitions from empty state to a grid of ~90 plugins. That visual change is the success signal; a toast on top would be redundant noise.

Toast notifications chosen over inline error text because it's consistent with the rest of the app (files, editor, updater all use `toastManager`).

### 2. `src/main/features/claude-code-plugins/plugins-service.ts`

Make `addMarketplace()` idempotent:

- Before `gitClone`, check if `installLocation` already exists (use `stat` from `node:fs/promises`)
- If exists AND already in `known_marketplaces.json` → delegate to `this.updateMarketplace(name)` and return the result
- If exists but NOT in known marketplaces (orphan dir from failed attempt) → `rm(installLocation, { recursive: true, force: true })` then proceed with fresh clone
- If not exists → proceed as-is (no change to current path)

This makes the "Add Official Marketplace" button safe to click repeatedly.

Also add post-clone manifest validation: after `gitClone`, read the manifest and check that `manifest.plugins` exists and is non-empty. If not, `rm` the cloned directory and throw a clear error: `"Not a valid marketplace: no plugins found in .claude-plugin/marketplace.json"`. This catches cases where the repo exists but isn't a valid marketplace (currently it would silently succeed with `pluginCount: 0` and the user sees an empty grid with no explanation).

For the idempotent update-instead-of-add path: if `updateMarketplace` fails, catch and rethrow with a clearer message: `"Marketplace already configured. Update failed: <original error>"`. Without this, the user sees the generic "Failed to add marketplace" from the router's `wrapError`, which is confusing since the marketplace already exists and it was actually a pull that failed.

### 3. `src/main/features/claude-code-plugins/git-utils.ts`

Two changes:

**a) GitHub shorthand expansion**

Add helper:

```ts
function expandGitUrl(url: string): string {
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    return `https://github.com/${url}.git`;
  }
  return url;
}
```

Apply `expandGitUrl` in `gitClone` and `gitCloneSubdir` before passing URL to `execFileAsync`.

**b) Retry wrapper**

Add smart retry wrapper that only retries transient failures:

```ts
function isTransientGitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  // Exit code 128 = fatal git errors (repo not found, auth, invalid URL) — don't retry
  if (msg.includes("exit code 128")) return false;
  // Retry on: timeout, connection reset, DNS failures
  return true;
}

async function withRetry<T>(fn: () => Promise<T>, retries = 1, delayMs = 2000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0 || !isTransientGitError(err)) throw err;
    await new Promise((r) => setTimeout(r, delayMs));
    return withRetry(fn, retries - 1, delayMs);
  }
}
```

Wrap `execFileAsync` calls in `gitClone` and `gitPull` with `withRetry` (1 retry, 2s delay). Permanent failures (repo not found, auth errors — exit code 128) are thrown immediately without the 2s wait.

### 4. Locale files (`en-US.json`, `zh-CN.json`)

Add i18n key:

- `settings.plugins.officialMarketplaceError` — error toast title

## Future consideration: auto-seed official marketplace

Instead of requiring the user to discover and click "Add Official Marketplace", the app could auto-add `anthropics/claude-plugins-official` on first launch (when `known_marketplaces.json` doesn't exist). The empty state would become a fallback for "network failed during first setup" rather than the default experience. This is a bigger UX decision — out of scope for this fix but worth considering as a follow-up.

## What stays the same

- `add-marketplace-modal.tsx` — example text `anthropics/claude-plugins-official` is the correct repo
- `router.ts` — no changes needed
- `contract.ts` — no changes needed
