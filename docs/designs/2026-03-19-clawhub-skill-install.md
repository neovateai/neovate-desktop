# ClawHub Skill Installation

## Summary

Add support for installing skills from ClawHub (clawhub.ai) by pasting a ClawHub URL or using a `clawhub:` shorthand in the existing add-skill modal. Implements a new `ClawhubInstaller` following the existing `SkillInstaller` interface pattern.

## Scope

- Detect `https://clawhub.ai/{owner}/{slug}` URLs and `clawhub:{slug}` shorthand in the add-skill modal
- Download skill zip via ClawHub's public API, extract with `yauzl` (no CLI dependency)
- Support optional version pinning (`?version=1.2.0` or `clawhub:slug@1.2.0`)
- Track as `source: "clawhub"` in install metadata for version checking
- Add URL example hint in the add-skill modal UI

**Not in scope**: ClawHub auth/login, starring, search API, browse/marketplace UI.

## Changes

### 1. Types — `shared/features/skills/types.ts`

Add `"clawhub"` to the `SkillSource` union:

```ts
export type SkillSource = "prebuilt" | "git" | "npm" | "clawhub";
```

### 2. New installer — `main/features/skills/installers/clawhub.ts`

New `ClawhubInstaller` class implementing `SkillInstaller`:

| Method                                                 | Behavior                                                                                                                         |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| `detect(sourceRef)`                                    | Returns `true` if sourceRef starts with `https://clawhub.ai/` or `clawhub:`                                                      |
| `scan(sourceRef)`                                      | Parse slug (+ optional version), download zip via `GET /api/v1/download?slug={slug}`, extract to temp dir, run `scanSkillDirs()` |
| `install(sourceRef, skillName, targetDir)`             | Same download+extract flow, copy skill to target dir                                                                             |
| `installFromPreview(previewId, skillPaths, targetDir)` | Copy from cached temp dir to target dir                                                                                          |
| `cleanup(previewId)`                                   | Remove temp dir                                                                                                                  |
| `getLatestVersion(sourceRef)`                          | `GET /api/v1/skills/{slug}` -> parse latest version string from JSON                                                             |

#### URL parsing and sourceRef normalization

Strict extraction of slug from the **second** path segment of `/{owner}/{slug}`:

```
https://clawhub.ai/owner/my-skill               -> slug: "my-skill", version: undefined
https://clawhub.ai/owner/my-skill?version=1.2.0 -> slug: "my-skill", version: "1.2.0"
clawhub:my-skill                                 -> slug: "my-skill", version: undefined
clawhub:my-skill@1.2.0                           -> slug: "my-skill", version: "1.2.0"
```

Strip trailing slashes, query params (except `version`), and fragments before parsing. Reject URLs with fewer than 2 path segments.

**Canonical sourceRef**: All inputs are normalized to `clawhub:{slug}` for storage in `.neovate-install.json`. The ClawHub API only needs the slug (not the owner), so this avoids needing an extra API call to resolve owner from shorthand input. Both `detect()` and `getLatestVersion()` only need to handle `clawhub:` format internally.

```
Input: https://clawhub.ai/owner/my-skill  -> stored: clawhub:my-skill
Input: clawhub:my-skill                   -> stored: clawhub:my-skill
```

#### API endpoints used (all public, no auth required)

- `GET https://clawhub.ai/api/v1/download?slug={slug}[&version={version}]` — returns zip file
- `GET https://clawhub.ai/api/v1/skills/{slug}` — returns metadata including latest version

#### Timeouts

- **Metadata API calls** (`/api/v1/skills/{slug}`): 10s — lightweight JSON responses
- **Zip download** (`/api/v1/download`): 60s — ClawHub allows up to 50MB bundles

Consistent with existing installers (git: 60s clone / 15s ls-remote, npm: 60s pack / 15s view).

#### Zip extraction

Use `yauzl` (pure JS zip library) instead of shelling out to `unzip` CLI. This avoids a platform dependency — `unzip` is not guaranteed on minimal Linux installs. The `yauzl` library is small, well-tested, and commonly used in Electron apps.

Add dev dependency: `yauzl` + `@types/yauzl`.

### 3. Service updates — `main/features/skills/skills-service.ts`

- Import and add `ClawhubInstaller` to the `this.installers` array (before `GitInstaller` so `clawhub.ai` URLs don't fall through to git's `https://` detection)
- Update `writeInstallMeta()` to detect clawhub source from `clawhub:` prefix (sourceRef is already normalized by this point)
- Update `remoteSkillSchema` source enum to include `"clawhub"`

### 4. UI update — `renderer/.../skill-add-modal.tsx`

Add ClawHub examples to the input hints section:

```
https://clawhub.ai/owner/skill-name
clawhub:skill-name
```

### 5. Install metadata format

```json
{
  "installedFrom": "clawhub:my-skill",
  "version": "1.2.0",
  "source": "clawhub",
  "installedAt": "2026-03-19T10:30:00Z"
}
```

All inputs (full URL or shorthand) are normalized to `clawhub:{slug}` before storage. The API only needs the slug.

## Data flow

```
User pastes URL in add-skill modal
  -> renderer calls client.skills.preview({ source: "https://clawhub.ai/owner/my-skill" })
  -> main: SkillsService.preview() -> ClawhubInstaller.detect() matches
  -> ClawhubInstaller.scan():
      1. Parse slug + optional version from URL
      2. fetch("https://clawhub.ai/api/v1/download?slug=my-skill")
      3. Write zip to temp file, extract with yauzl to temp dir
      4. scanSkillDirs(extractedDir) -> PreviewSkill[]
  -> renderer shows skill selection UI
  -> user clicks Install
  -> ClawhubInstaller.installFromPreview() copies to ~/.claude/skills/
  -> writeInstallMeta() normalizes sourceRef to "clawhub:my-skill", records source: "clawhub"
```

## Update checking

When `checkUpdates()` runs for a clawhub-sourced skill:

1. Read `.neovate-install.json` -> `installedFrom: "clawhub:my-skill"`
2. `ClawhubInstaller.getLatestVersion()` -> extract slug -> `GET /api/v1/skills/my-skill` -> parse latest version
3. Compare with stored version -> show update badge if different

## Files to modify

| File                                                                       | Change                                        |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| `src/shared/features/skills/types.ts`                                      | Add `"clawhub"` to `SkillSource`              |
| `src/main/features/skills/installers/clawhub.ts`                           | New file: `ClawhubInstaller` class            |
| `src/main/features/skills/skills-service.ts`                               | Register installer, update source detection   |
| `src/renderer/src/features/settings/components/panels/skill-add-modal.tsx` | Add URL + shorthand example hints             |
| `package.json`                                                             | Add `yauzl` + `@types/yauzl` dev dependencies |
