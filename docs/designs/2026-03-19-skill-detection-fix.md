# Fix: 3-Tier Skill Detection for Git/npm Sources

**Date:** 2026-03-19
**Status:** Approved

## Problem

`scanSkillDirs()` in `skill-utils.ts` only checks top-level subdirectories for `<dir>/SKILL.md`. It misses two common repo layouts:

1. **Root-level** `SKILL.md` (single-skill repos like `github.com/user/my-skill`)
2. **`skills/` subdirectory** pattern `skills/<name>/SKILL.md` (organized multi-skill repos)

Additionally, both `GitInstaller` and `NpmInstaller` have `installFromPreview()` / `install()` methods that assume skill directories are always at `tmpDir/<name>`, which breaks for root and nested patterns.

### Reference Implementation

Takumi's `SkillManager.scanForSkills()` (`src/skill.ts:514-549`) uses a 3-tier strategy:

1. Root `SKILL.md` -> return immediately (single-skill repo)
2. `skills/<name>/SKILL.md` -> return all matches
3. `<name>/SKILL.md` at top level -> fallback

Neovate only implements tier 3.

## Changes

### 1. `src/main/features/skills/skill-utils.ts` — 3-tier scan + shared install helpers

**3-tier `scanSkillDirs()`:**

Rewrite the no-`singleName` path to match takumi's scan order:

```
Tier 1: baseDir/SKILL.md
  -> [{ name: <from frontmatter or dirname>, description, skillPath: "." }]

Tier 2: baseDir/skills/<name>/SKILL.md
  -> [{ name, description, skillPath: "skills/<name>" }, ...]

Tier 3: baseDir/<name>/SKILL.md  (existing behavior)
  -> [{ name, description, skillPath: "<name>" }, ...]
```

`skillPath` becomes the **relative path from baseDir to the skill directory**, not just the directory name. This is the key change — it encodes where the skill lives so the installer can find it.

**Tier priority:** Each tier returns early. If a root `SKILL.md` exists (tier 1), the entire source is treated as a single skill — subdirectories with their own `SKILL.md` are ignored. This matches takumi's behavior and prevents ambiguity: a repo is either one skill (root) or a collection of skills (tier 2/3), never both.

Extract the existing subdirectory scanning into a helper `scanSubdirectories(dir, prefix)` to reuse between tier 2 and tier 3.

For tier 1 (root-level), extract the skill name from frontmatter's `name` field if present, otherwise fall back to `path.basename(baseDir)`.

**Shared install path helpers** (used by both GitInstaller and NpmInstaller):

```ts
/** Resolve the absolute source path for a skill within a base directory. */
export function resolveSkillSource(baseDir: string, skillPath: string): string {
  return skillPath === "." ? baseDir : path.join(baseDir, skillPath);
}

/** Derive the destination folder name for installing a skill. */
export function deriveInstallName(skillPath: string, sourceRef: string): string {
  return skillPath === "." ? extractFolderName(sourceRef) : path.basename(skillPath);
}

/** Extract a folder name from a source URL (ported from takumi, extended for npm). */
export function extractFolderName(sourceRef: string): string {
  // Git sources:
  //   "https://github.com/user/my-skills" -> "my-skills"
  //   "https://github.com/user/repo/tree/main/skills/foo" -> "foo"
  //   "user/repo" -> "repo"
  //   "git:user/repo" -> "repo"
  //   "gitlab:user/repo" -> "repo"
  // npm sources:
  //   "npm:@scope/package" -> "package"
  //   "npm:some-skill" -> "some-skill"
  //   "npm:@scope/package@1.2.3" -> "package"
  //   "@scope/package" -> "package"
}
```

This keeps installers thin and avoids duplicating path resolution logic.

### 2. `src/main/features/skills/installers/types.ts` — Update interface

Rename `skillNames` to `skillPaths` and change return type from `void` to `string[]` (installed directory names relative to `targetDir`). This lets the service write install metadata without replicating path derivation logic:

```ts
installFromPreview(previewId: string, skillPaths: string[], targetDir: string): Promise<string[]>;
```

### 3. `src/main/features/skills/installers/git.ts` — Fix install paths

**Store sourceRef with preview:**

Change `previewDirs` from `Map<string, string>` to `Map<string, { tmpDir: string; sourceRef: string }>` so we can derive folder names for root-level skill installs.

**Update `installFromPreview()`** using the shared helpers:

```ts
const installed: string[] = [];
for (const sp of skillPaths) {
  const destName = deriveInstallName(sp, preview.sourceRef);
  const src = resolveSkillSource(tmpDir, sp);
  const dest = path.join(targetDir, destName);
  await cp(src, dest, { recursive: true, filter: (s) => path.basename(s) !== ".git" });
  installed.push(destName);
}
return installed;
```

The `.git` filter is git-only — npm pack doesn't produce `.git` directories.

**Update `install()`** for the recommended-skill flow:

Handle `skillName === "."` by using `deriveInstallName(skillName, sourceRef)` for the destination folder name instead of raw `skillName`. Without this, `path.join(targetDir, ".")` resolves to `targetDir` itself — silently writing into the parent directory.

### 4. `src/main/features/skills/installers/npm.ts` — Same install path fixes

NpmInstaller calls `scanSkillDirs(extractedDir)` — so the 3-tier scan fix applies automatically.

But `installFromPreview()` and `install()` have the same broken path assumption as GitInstaller:

```js
const src = path.join(extractedDir, name); // assumes <dir>/<name>
```

Apply the same fix using the shared `resolveSkillSource()` / `deriveInstallName()` helpers.

Store `sourceRef` alongside `tmpDir` in `previewDirs` map (same pattern as GitInstaller).

No `.git` filter needed — npm pack doesn't produce `.git` directories.

### 5. `src/renderer/src/features/settings/components/panels/skill-add-modal.tsx` — Use `skillPath` for selection

Currently `selected` is a `Set<string>` of skill names, and `selectedSkills` sends names to the backend.

Change to use `skill.skillPath`:

- `selected: new Set(result.skills.map((s) => s.skillPath))`
- `toggleSkill` toggles by `skillPath`
- `selectedSkills: Array.from(selected)` now sends `skillPath` values
- Continue displaying `skill.name` in the UI (no visual change)

No contract change needed — `selectedSkills: z.array(z.string())` stays the same, just carries `skillPath` values instead of names.

### 6. `src/main/features/skills/skills-service.ts` — Write install metadata for preview installs

Currently `installFromPreview()` doesn't call `writeInstallMeta()` (only `install()` does). This means preview-installed skills lack `.neovate-install.json`, causing:

- No version tracking
- No `installedFrom` field
- Update checks skip them

Fix: store a `Map<previewId, sourceRef>` in the service from the `preview()` call. In `installFromPreview()`, use the `string[]` returned by the installer (installed directory names) to write metadata without replicating path logic:

```ts
const sourceRef = this.previewSources.get(previewId);
const installedNames = await installer.installFromPreview(previewId, selectedSkills, targetDir);
for (const name of installedNames) {
  await this.writeInstallMeta(path.join(targetDir, name), sourceRef);
}
```

## Files Changed

| File                                              | Change                                                                                                                                 |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/features/skills/skill-utils.ts`         | 3-tier `scanSkillDirs()`, `scanSubdirectories()` helper, shared `resolveSkillSource()` / `deriveInstallName()` / `extractFolderName()` |
| `src/main/features/skills/installers/types.ts`    | Rename `skillNames` -> `skillPaths`, return `string[]` from `installFromPreview`                                                       |
| `src/main/features/skills/installers/git.ts`      | Store sourceRef, use shared helpers, `.git` filter for root copies                                                                     |
| `src/main/features/skills/installers/npm.ts`      | Store sourceRef, use shared helpers (no `.git` filter)                                                                                 |
| `src/main/features/skills/installers/prebuilt.ts` | Rename parameter to match interface (no logic change)                                                                                  |
| `src/renderer/src/.../skill-add-modal.tsx`        | Use `skillPath` for selection identity                                                                                                 |
| `src/main/features/skills/skills-service.ts`      | Store preview sourceRef, write install meta for preview installs                                                                       |

## Not Changed

- **`src/shared/features/skills/types.ts`** — `PreviewSkill.skillPath` already exists, just used differently
- **`src/shared/features/skills/contract.ts`** — `selectedSkills: z.array(z.string())` unchanged
