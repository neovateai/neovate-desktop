# Skills Remote Registry

## Overview

Replace the static `prebuilt-manifest.ts` with a remote JSON manifest fetched from a configurable URL. No fallback — if fetch fails, return empty array.

## How it works

1. `SkillsService.recommended()` fetches from configurable URLs (e.g. `["https://neovate.ai/skills.json"]`)
2. 1-hour in-memory cache — avoids hitting the network on every panel open
3. No fallback — if all fetches fail, propagate error so UI can show failure state
4. Refresh button clears cache and re-fetches
5. Each entry validated with zod — malformed entries silently dropped

## Remote JSON format

The URL returns an array of recommended skills:

```json
[
  {
    "name": "pr-apply",
    "description": "Apply PR changes to codebase",
    "source": "git",
    "sourceRef": "git:https://github.com/anthropics/claude-skills",
    "skillName": "pr-apply",
    "version": "1.0.0"
  }
]
```

## Changes

### 1. Config type — add `skillsRegistryUrls`

```ts
// shared/features/config/types.ts
skillsRegistryUrls?: string[];  // default: ["https://neovate.ai/skills.json"]
```

Multiple URLs supported. All fetched in parallel, results merged and deduped by `skillName`. Users/companies can add their own internal registry alongside the public one.

### 2. Contract — add `forceRefresh` to `recommended`

```ts
// shared/features/skills/contract.ts
recommended: oc
  .input(z.object({ forceRefresh: z.boolean().optional() }))
  .output(type<RecommendedSkill[]>()),
```

### 3. `SkillsService` — cached remote fetch with validation

Replace static `PREBUILT_SKILLS` import with `fetchRegistry()`:

```ts
import { z } from "zod";

const DEFAULT_REGISTRY_URLS = ["https://neovate.ai/skills.json"];
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const remoteSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["prebuilt", "git", "npm"]),
  sourceRef: z.string(),
  skillName: z.string(),
  version: z.string().optional(),
});

export class SkillsService {
  private registryCache: { data: Omit<RecommendedSkill, "installed">[]; fetchedAt: number } | null =
    null;
  private configStore: ConfigStore;

  constructor(projectStore, configStore, resourcesDir) {
    this.configStore = configStore;
    // ... existing init
  }

  async recommended(forceRefresh?: boolean): Promise<RecommendedSkill[]> {
    if (forceRefresh) this.registryCache = null;

    const registry = await this.fetchRegistry();
    const installed = await this.list("all");
    const installedNames = new Set(installed.map((s) => s.name));

    return registry.map((skill) => ({
      ...skill,
      installed: installedNames.has(skill.skillName),
    }));
  }

  private async fetchRegistry(): Promise<Omit<RecommendedSkill, "installed">[]> {
    if (this.registryCache && Date.now() - this.registryCache.fetchedAt < CACHE_TTL_MS) {
      return this.registryCache.data;
    }

    const urls: string[] = this.configStore.get("skillsRegistryUrls") || DEFAULT_REGISTRY_URLS;

    // Fetch all registries in parallel
    const results = await Promise.allSettled(urls.map((url) => this.fetchSingleRegistry(url)));

    // If ALL fetches failed, propagate error so UI can distinguish
    // "empty registry" from "network failure"
    const allFailed = results.every((r) => r.status === "rejected");
    if (allFailed && urls.length > 0) {
      const firstError = results[0] as PromiseRejectedResult;
      throw new Error(
        `Failed to fetch skills registry: ${firstError.reason?.message ?? "unknown error"}`,
      );
    }

    // Merge successful results, dedupe by skillName
    const seen = new Set<string>();
    const merged: Omit<RecommendedSkill, "installed">[] = [];
    for (const result of results) {
      if (result.status !== "fulfilled") continue;
      for (const skill of result.value) {
        if (seen.has(skill.skillName)) continue;
        seen.add(skill.skillName);
        merged.push(skill);
      }
    }

    this.registryCache = { data: merged, fetchedAt: Date.now() };
    return merged;
  }

  private async fetchSingleRegistry(url: string): Promise<Omit<RecommendedSkill, "installed">[]> {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("Invalid registry format: expected array");

    // Validate each entry, silently drop malformed ones
    return data.filter((item) => remoteSkillSchema.safeParse(item).success);
  }
}
```

### Error propagation to UI

When all registry fetches fail, `recommended()` throws instead of returning `[]`. The renderer catches this and shows an error state:

```
"Failed to load recommended skills. Check your network or registry URL."
[Retry]
```

This distinguishes three states:

- **Loading**: spinner
- **Empty**: "No recommended skills available." (registry responded with empty array)
- **Error**: "Failed to load recommended skills." (network/fetch failure)

### 4. Constructor — pass `configStore`

```ts
// main/index.ts
const skillsService = new SkillsService(projectStore, configStore, process.resourcesPath);
```

### 5. Validation schema

Each entry from the remote JSON is validated with zod before being accepted. Invalid entries are silently dropped — a single bad entry doesn't break the entire list.

```ts
const remoteSkillSchema = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["prebuilt", "git", "npm"]),
  sourceRef: z.string(),
  skillName: z.string(),
  version: z.string().optional(),
});
```

### 6. Delete `prebuilt-manifest.ts`

No longer needed.

### 7. Renderer — pass `forceRefresh` on Refresh click

```ts
// skills-panel.tsx refresh handler
const [installedResult, recommendedResult] = await Promise.all([
  client.skills.list({ scope: "all" }),
  client.skills.recommended({ forceRefresh: true }),
]);
```

Normal panel open uses `{ forceRefresh: false }` (or omit), hitting the 1-hour cache.

## File changes summary

| File                                        | Change                                                                                                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/features/config/types.ts`           | Add `skillsRegistryUrls?: string[]`                                                                                                                              |
| `shared/features/skills/contract.ts`        | Add `forceRefresh` input to `recommended`                                                                                                                        |
| `main/features/skills/skills-service.ts`    | Replace `PREBUILT_SKILLS` with `fetchRegistry()`, add `configStore` dep, add cache, add zod validation, add multi-URL support, propagate errors on total failure |
| `main/features/skills/prebuilt-manifest.ts` | Delete                                                                                                                                                           |
| `main/index.ts`                             | Pass `configStore` to `SkillsService` constructor                                                                                                                |
| `renderer/.../skills-panel.tsx`             | Pass `forceRefresh: true` on Refresh, handle error vs empty state for recommended section                                                                        |
