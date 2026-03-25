# Fix: Skill Update Causes Data Loss

## 1. Background

When a user updates (upgrades) an installed skill, the skill is permanently lost if the reinstall fails. This is because the update method deletes the old skill directory before attempting to install the new version.

## 2. Requirements Summary

**Goal:** Fix the skill update flow to prevent data loss and correctly resolve source paths during reinstall.

**Scope:**

- In scope: Fix `update()` method, add `skillPath` to `InstallMeta`, preserve disabled state
- Out of scope: UI changes, installer interface changes, new features

## 3. Acceptance Criteria

1. If install fails during update, the original skill is preserved (not lost)
2. `skillPath` is stored in install metadata for correct source resolution during updates
3. Skills with root-level SKILL.md (skillPath ".") can be correctly updated
4. Disabled state is preserved after update
5. Existing skills without `skillPath` in meta still work (backward compatible)

## 4. Problem Analysis

**Bug 1: Delete-before-install (data loss)**

- `update()` calls `rm(skillDir)` before `installer.install()`
- If install fails (network error, timeout), the skill is gone forever

**Bug 2: Wrong source path during reinstall**

- `update()` passes `dirName` (installed dir name) to `installer.install()`
- Installers expect a `skillPath` (path within the source repo, e.g., "." or "skills/foo")
- `InstallMeta` doesn't store the original `skillPath`, so it can't be recovered

## 5. Decision Log

**1. How to prevent data loss during update?**

- Options: A) Backup-restore (rename old dir, restore on failure) - B) Install to temp then swap - C) Download first, delete+copy atomically
- Decision: **A)** -- Simplest, no temp dir management, works with existing installer interface

**2. Where to store the original skillPath?**

- Options: A) In `InstallMeta` (.neovate-install.json) - B) Derive from sourceRef at update time
- Decision: **A)** -- The skillPath cannot be reliably derived from sourceRef alone

**3. How to handle existing skills without skillPath in meta?**

- Options: A) Fall back to dirName - B) Require re-install
- Decision: **A)** -- Backward compatible, same behavior as before for existing installs

## 6. Design

### Changes

**`InstallMeta`** -- Add optional `skillPath` field to store the original path within the source repo.

**`writeInstallMeta()`** -- Accept and persist `skillPath`.

**`install()`** -- Pass `skillName` as `skillPath` to `writeInstallMeta`.

**`installFromPreview()`** -- Map installed names back to original skill paths and pass to `writeInstallMeta`.

**`update()`** -- Backup-restore pattern:

1. Check if skill is disabled (preserve state)
2. Read install meta
3. Rename old skill dir to backup
4. Install new version using stored `skillPath`
5. Handle name mismatch (installer may install to a different dir name)
6. Restore disabled state if needed
7. On success: delete backup, write new meta
8. On failure: delete partial install, restore backup

## 7. Files Changed

- `src/shared/features/skills/types.ts` -- add `skillPath` to `InstallMeta`
- `src/main/features/skills/skills-service.ts` -- fix `update()`, update `writeInstallMeta()`, update `install()`, update `installFromPreview()`

## 8. Verification

1. [AC1] Simulate update failure (e.g., bad sourceRef) -- skill should be preserved
2. [AC2] Install a skill, check `.neovate-install.json` contains `skillPath`
3. [AC3] Update a root-level skill (skillPath ".") -- should succeed
4. [AC4] Disable a skill, update it -- should remain disabled after update
5. [AC5] Update a skill with old meta (no skillPath) -- should fall back to dirName
