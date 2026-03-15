# npm Custom Registry Support

## Overview

Extend `NpmInstaller` to support custom npm registries (e.g. tnpm, cnpm, private registries) by encoding the registry URL directly in `sourceRef`.

## How it works

The `sourceRef` for npm sources gains an optional `?registry=<url>` query parameter:

```
npm:@corp/skills-pack                                              # default registry
npm:@corp/skills-pack?registry=https://registry.tnpm.example.com/  # custom registry
```

`NpmInstaller` parses the query param and passes `--registry=<url>` to all npm commands. No new source type, no schema changes, no plugin involvement.

## Changes

### 1. `NpmInstaller` — parse registry from sourceRef

Replace `normalizePackage()` with `parseSourceRef()`:

```ts
private parseSourceRef(sourceRef: string): { pkg: string; registry?: string } {
  const raw = sourceRef.replace(/^npm:/, "");
  const qIdx = raw.indexOf("?registry=");
  if (qIdx === -1) return { pkg: raw };
  return {
    pkg: raw.slice(0, qIdx),
    registry: raw.slice(qIdx + "?registry=".length),
  };
}
```

### 2. Pass `--registry` to npm commands

In `fetchAndExtract()` and `getLatestVersion()`, append `["--registry", registry]` to the npm args when registry is defined.

### 3. Remote registry JSON — no change needed

The registry URL is part of `sourceRef`. A tnpm skill entry:

```json
{
  "name": "Corp Deploy",
  "description": "Internal deploy helper",
  "source": "npm",
  "sourceRef": "npm:@corp/skills-pack?registry=https://registry.tnpm.example.com/",
  "skillName": "deploy-tool",
  "version": "1.0.0"
}
```

### 4. `getLatestVersion()` — parse registry before stripping version

The current code strips `@version` with a trailing regex:

```ts
const pkg = this.normalizePackage(sourceRef).replace(/@[\d.]+$/, "");
```

With `npm:@corp/pkg@2.1.0?registry=https://...`, the `@version` is no longer at the end — `?registry=` is. Must call `parseSourceRef()` first to split off registry, then strip version from `pkg`:

```ts
async getLatestVersion(sourceRef: string): Promise<string | undefined> {
  const { pkg: rawPkg, registry } = this.parseSourceRef(sourceRef);
  const pkg = rawPkg.replace(/@[\d.]+$/, "");
  const args = ["view", pkg, "version"];
  if (registry) args.push("--registry", registry);
  // ...
}
```

### 5. `detect()` — handle bare scoped packages with query params

`detect()` matches `@scope/pkg` without the `npm:` prefix. A bare `@corp/pkg?registry=https://...` still matches (the `@` prefix check passes), and `parseSourceRef`'s `replace(/^npm:/, "")` is a no-op when the prefix is absent — so it works, but only by accident. No code change needed, but worth noting for future maintainers.

### 6. Debug logging — include registry in log output

When npm commands fail against a custom registry, error messages from npm won't mention which registry was used. Include the registry URL in existing `debug()` calls so private registry issues are diagnosable:

```ts
log("fetchAndExtract", { pkg, registry: registry ?? "default" });
log("getLatestVersion", { pkg, registry: registry ?? "default" });
```

## What stays the same

- `SkillSource` type — stays `"prebuilt" | "git" | "npm"`
- `SkillInstaller` interface — no change
- `remoteSkillSchema` — `sourceRef` is `z.string()`, query param passes as-is
- `writeInstallMeta()` — full sourceRef (with registry) persisted, so updates/version checks use the correct registry automatically
- `detect()` — no change (still matches `npm:` prefix or `@scope/pkg`)
- Plugin system — not involved
- Renderer / UI — no change

## File changes

| File                                     | Change                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `main/features/skills/installers/npm.ts` | Replace `normalizePackage()` with `parseSourceRef()`, pass `--registry` to npm commands |
