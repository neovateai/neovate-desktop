# Skills Settings Page

## Overview

Refactor the skills settings page into a marketplace-style panel with two sections:

1. **Installed** — scoped by All / Global / Project (switchable), with enable/disable toggle and detail modal
2. **Recommended** — unified list from all sources (prebuilt, git, npm), searchable, installable

Clicking any skill (installed or recommended) opens a detail modal with conditional actions.

## UI Layout

```
+----------------------------------------------+
| Skills                 Search   [Refresh]     |
+----------------------------------------------+
| Installed              [v All]                |
|                         | All                 |
|                         | Global              |
|                         | Project A           |
|                         | Project B           |
|                                               |
|   +------------------------------------------+|
|   | pr-apply              [global] [on/off]  ||  <- click row opens detail modal
|   | Apply PR changes to codebase             ||
|   +------------------------------------------+|
|   | commit                [global] [on/off]  ||
|   | Quick commit with conventions            ||
|   +------------------------------------------+|
|   | deploy              [neovate]  [on/off]  ||
|   | Deploy to production                     ||
|   +------------------------------------------+|
|                                               |
|   No skills installed?                        |
|   "No skills installed. Browse recommended    |
|    skills below or add from URL."             |
|                                               |
+----------------------------------------------+
| Recommended (8)                               |
|   +------------------------------------------+|
|   | codebase-viz            [Install v]      ||
|   | Interactive codebase explorer            ||
|   | source: prebuilt                         ||
|   +------------------------------------------+|
|   | db-migrate              [Install v]      ||
|   | Database migration helper                ||
|   | source: npm                              ||
|   +------------------------------------------+|
|   | pr-apply                [Installed]      ||  <- already installed, badge instead of button
|   | Apply PR changes to codebase             ||
|   | source: prebuilt                         ||
|   +------------------------------------------+|
|                                               |
|   [+ Add from URL/package...]                 |
+----------------------------------------------+
```

### Scope Selector

- Dropdown above the installed list: **All** (default), **Global**, + projects from the project store
- "All" shows a flat list with scope badges (e.g. `[global]`, `[neovate]`) on each row
- "Global" or a specific project filters to that scope only (no badges needed)
- Switching scope re-fetches installed skills for that scope
- Stored in local component state (not persisted)

### Search

- Single search bar at the top filters both installed and recommended lists
- Filters by name and description substring match
- Empty state: "No skills matching '...'"

### Refresh

- Button re-fetches both installed and recommended lists
- Does NOT auto-run `checkUpdates` (too expensive — hits npm registry / git remotes)
- Update checking is a separate explicit action: a "Check for updates" link or button below the installed list
- Update check results are cached for the session (cleared on page leave)

### Empty States

- No installed skills: "No skills installed. Browse recommended skills below or add from URL."
- No recommended skills: "No recommended skills available."
- Search returns nothing: "No skills matching '...'"

### Sorting

- Installed skills: alphabetical by name
- Recommended skills: alphabetical by name, installed skills sorted to bottom

### Recommended List — Installed Skill Handling

- If a recommended skill is already installed (in any scope), show an "Installed" badge instead of the "Install" button
- The row is still clickable to open the detail modal (which shows the installed view)

## Skill Detail Modal

One modal component with conditional rendering based on install state.

### Installed Skill

```
+------------------------------------------+
| [x]                                      |
|                                          |
|  pr-apply                     [on/off]   |
|  Apply PR changes to codebase            |
|  Scope: Global | Version: 1.2.0         |
|  Source: npm:@claude-skills/pr-apply     |
|                                          |
|  [Update available: v1.3.0]             |
|                                          |
|  Metadata:                               |
|    Model invocation: enabled             |
|    User invocable: yes                   |
|    Allowed tools: Read, Grep, Glob       |
|    Context: fork                         |
|  ------                                  |
|  (SKILL.md content rendered as markdown) |
|  ...                                     |
|  ------                                  |
|  Path: ~/.claude/skills/pr-apply/        |
|  [Open Folder]  [Uninstall]              |
+------------------------------------------+
```

Notes:

- Version, source, and update button only shown if install metadata exists
- Update button only shown if `checkUpdates` found a newer version

Actions:

- **Enable/disable toggle** — renames SKILL.md to/from SKILL.md.disabled
- **Open Folder** — opens the skill directory in system file manager (`shell.showItemInFolder`)
- **Uninstall** — opens a confirmation alert dialog ("Remove skill 'pr-apply'? This will delete the skill directory."), then deletes the skill directory

### Recommended (Not Installed) Skill

```
+------------------------------------------+
| [x]                                      |
|                                          |
|  codebase-viz                            |
|  Interactive codebase explorer           |
|  Source: prebuilt                         |
|                                          |
|  Metadata:                               |
|    (shown if available from source)      |
|  ------                                  |
|  (SKILL.md content preview if available) |
|  ...                                     |
|  ------                                  |
|  [Install to: v Global]  [Install]       |
+------------------------------------------+
```

Actions:

- **Scope picker** — dropdown: Global + projects from project store
- **Install** — installs to selected scope using appropriate installer
- **Install button states**: idle -> spinner ("Installing...") -> success (modal closes, list refreshes)

### Conflict Handling

If the target directory already has a skill with the same name:

1. Show a confirmation dialog: "Skill 'pr-apply' already exists in [scope]. Overwrite?"
2. If confirmed, delete the existing skill directory and install the new one
3. If cancelled, offer to rename: auto-suggest `pr-apply-2` and let user edit the name

## Add from URL/Package Modal

Clicking `[+ Add from URL/package...]` opens a **separate modal** (not inline) with a multi-step flow:

```
Step 1: Input
+------------------------------------------+
| Add Skill                          [x]   |
|                                          |
|  Enter a source:                         |
|  [git URL, npm package, or local path]   |
|                                          |
|  Examples:                               |
|    github.com/user/claude-skills         |
|    npm:@claude-skills/pr-apply           |
|    /path/to/local/skill                  |
|                                          |
|                          [Next]          |
+------------------------------------------+

Step 1.5: Fetching (while preview endpoint clones/fetches)
+------------------------------------------+
| Add Skill                          [x]   |
|                                          |
|  Fetching skills from source...          |
|  [spinner]                               |
|                                          |
|  github.com/user/claude-skills           |
|                                          |
|                        [Cancel]          |
+------------------------------------------+

Cancel calls `cancelPreview` to clean up the tmp directory.
On error, returns to Step 1 with error message shown.

Step 2: Select (after fetch/clone)
+------------------------------------------+
| Add Skill                          [x]   |
|                                          |
|  Found 3 skills in source:              |
|  [x] pr-apply - Apply PR changes        |
|  [x] commit   - Quick commit            |
|  [ ] deploy   - Deploy to prod          |
|                                          |
|  Install to: [v Global]                  |
|                                          |
|  2 selected           [Cancel] [Install] |
+------------------------------------------+

Step 3: Installing (progress)
+------------------------------------------+
| Add Skill                          [x]   |
|                                          |
|  Installing 2 skills...                  |
|  [=====>                          ] 50%  |
|                                          |
+------------------------------------------+
```

The source is auto-detected:

- URL pattern or `git:` prefix -> GitInstaller
- `npm:` prefix or `@scope/package` pattern -> NpmInstaller
- Absolute path -> local copy

## Data Types

```ts
// shared/features/skills/types.ts

interface SkillFrontmatter {
  disableModelInvocation?: boolean;
  userInvocable?: boolean;
  allowedTools?: string[];
  model?: string;
  context?: "fork";
  agent?: string;
  argumentHint?: string;
}

interface SkillMeta {
  name: string;
  description: string;
  dirPath: string; // absolute path to skill directory (not the file)
  scope: "global" | "project";
  projectPath?: string; // for project-scoped skills
  enabled: boolean; // SKILL.md exists (true) vs .disabled (false)
  frontmatter: SkillFrontmatter; // parsed YAML frontmatter (typed)
  version?: string; // installed version (from install metadata, if tracked)
  installedFrom?: string; // sourceRef used to install (for update checking)
}

interface RecommendedSkill {
  name: string;
  description: string;
  source: SkillSource;
  sourceRef: string; // "prebuilt:pr-apply", "npm:@claude-skills/pr-apply@1.2.0", "git:https://..."
  skillName: string; // exact skill directory name to install (each entry = exactly one skill)
  version?: string; // source version (npm version, git tag/commit, app version for prebuilt)
  installed: boolean; // already installed in any scope?
}

type SkillSource = "prebuilt" | "git" | "npm";

interface PreviewSkill {
  name: string;
  description: string;
  skillPath: string; // relative path within the cloned/extracted source
}

interface SkillUpdate {
  name: string;
  scope: "global" | "project";
  projectPath?: string;
  currentVersion?: string;
  latestVersion: string;
  sourceRef: string;
}
```

## oRPC Contract

```ts
// shared/features/skills/contract.ts

skillsContract = {
  // List installed skills for a given scope ("all" returns both global + all projects)
  list: ({ scope: "all" | "global" | "project", projectPath?: string }) => SkillMeta[]

  // Get SKILL.md file content for detail modal
  // NOTE: resolves path from (name, scope) on the backend — never accepts raw paths from renderer
  getContent: ({ name: string, scope: "global" | "project", projectPath?: string }) => string

  // Get recommended skills from all sources
  recommended: () => RecommendedSkill[]

  // Preview skills from a user-provided source (git URL, npm package, local path)
  // Clones/fetches to tmp, scans for SKILL.md dirs, returns preview
  preview: ({ source: string }) => { previewId: string, skills: PreviewSkill[] }

  // Install a skill from a source reference (for recommended list one-click install)
  // Each RecommendedSkill has a skillName field so the installer knows exactly which skill to extract
  install: ({ sourceRef: string, skillName: string, scope: "global" | "project", projectPath?: string }) => void

  // Install selected skills from a preview (for "Add from URL/package" flow)
  installFromPreview: ({ previewId: string, selectedSkills: string[], scope: "global" | "project", projectPath?: string }) => void

  // Remove an installed skill (deletes skill directory)
  remove: ({ name: string, scope: "global" | "project", projectPath?: string }) => void

  // Enable a disabled skill (rename SKILL.md.disabled -> SKILL.md)
  enable: ({ name: string, scope: "global" | "project", projectPath?: string }) => void

  // Disable an enabled skill (rename SKILL.md -> SKILL.md.disabled)
  disable: ({ name: string, scope: "global" | "project", projectPath?: string }) => void

  // Open skill folder in system file manager (validates path is within known skills dirs)
  openFolder: ({ name: string, scope: "global" | "project", projectPath?: string }) => void

  // Check if a skill name already exists in the target scope
  exists: ({ name: string, scope: "global" | "project", projectPath?: string }) => boolean

  // Cancel and clean up a preview (delete cloned/extracted tmp directory)
  cancelPreview: ({ previewId: string }) => void

  // Check for available updates for installed skills that have installedFrom metadata
  // Returns skills that have a newer version available from their source
  checkUpdates: ({ scope: "all" | "global" | "project", projectPath?: string }) => SkillUpdate[]

  // Update an installed skill to the latest version from its source
  update: ({ name: string, scope: "global" | "project", projectPath?: string }) => void
}
```

### Security Notes

- `getContent` and `openFolder` resolve paths on the backend from `(name, scope, projectPath)` — they never accept raw filesystem paths from the renderer
- The backend validates that `projectPath` is a known project from the project store before accessing `.claude/skills/` within it
- Prebuilt skills are read from a hardcoded app resources directory — no user input in the path

## Architecture

### File Structure

```
packages/desktop/src/
  shared/features/skills/
    types.ts              # SkillMeta, SkillFrontmatter, RecommendedSkill, SkillSource, PreviewSkill
    contract.ts           # oRPC contract

  main/features/skills/
    router.ts             # oRPC router implementation
    skills-service.ts     # Core logic: scan, install, remove, enable/disable
    prebuilt-manifest.ts  # Hardcoded list of prebuilt recommended skills
    installers/
      types.ts            # SkillInstaller interface
      prebuilt.ts         # Copy from app resources
      git.ts              # Clone repo, scan, copy
      npm.ts              # Fetch tarball, extract, scan, copy

  renderer/src/features/settings/components/panels/
    skills-panel.tsx        # Rewrite existing panel (marketplace layout)
    skill-detail-modal.tsx  # Detail modal with conditional actions
    skill-add-modal.tsx     # "Add from URL/package" multi-step modal
```

### Data Flow

```
Renderer (skills-panel.tsx)
    | oRPC
Main Process (skills router)
    -> SkillsService
        -> discovers installed skills (scan ~/.claude/skills + project .claude/skills)
        -> discovers recommended skills (prebuilt manifest + remote sources)
        -> installs via SkillInstaller (prebuilt/git/npm)
        -> enable/disable via rename (SKILL.md <-> SKILL.md.disabled)
```

### Install Strategy Pattern

```ts
// main/features/skills/installers/types.ts

interface SkillInstaller {
  detect(sourceRef: string): boolean;
  scan(sourceRef: string): Promise<{ previewId: string; skills: PreviewSkill[] }>;
  install(sourceRef: string, targetDir: string): Promise<void>;
  installFromPreview(previewId: string, skillNames: string[], targetDir: string): Promise<void>;
  cleanup(previewId: string): Promise<void>;
  getLatestVersion?(sourceRef: string): Promise<string | undefined>;
}
```

Implementations:

| Installer         | Detection                            | Install Logic                                                                                                                              |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| PrebuiltInstaller | `sourceRef.startsWith("prebuilt:")`  | Copy from app `resources/skills/<name>/` to target                                                                                         |
| GitInstaller      | URL pattern or `git:` prefix         | Clone to tmp -> scan for SKILL.md dirs -> copy selected to target                                                                          |
| NpmInstaller      | `npm:` prefix or npm package pattern | Fetch tarball via `npm pack --json` -> extract -> scan for SKILL.md -> copy to target. Implements `getLatestVersion` via npm registry API. |

Source detection order: prebuilt -> npm -> git (fallback).

### Preview Lifecycle

Previews are stored in tmp directories keyed by `previewId`:

- Created by `preview` or `scan` — clones/extracts source to `os.tmpdir()/neovate-skill-preview-<previewId>/`
- Consumed by `installFromPreview` — copies selected skills from tmp to target, then auto-cleans up
- Cancelled by `cancelPreview` — deletes the tmp directory
- Auto-cleaned: `SkillsService` runs a cleanup timer on startup, deleting previews older than 30 minutes

### Error Handling

Each endpoint can fail with structured errors. The renderer shows error messages inline.

| Endpoint             | Failure modes                                                                          |
| -------------------- | -------------------------------------------------------------------------------------- |
| `list`               | Permission denied (show error), directory not found (return [])                        |
| `getContent`         | Skill not found, file read error                                                       |
| `preview`            | Network error (git clone / npm fetch failed), timeout, no SKILL.md found in source     |
| `install`            | Network error, conflict (already exists — triggers conflict dialog), permission denied |
| `installFromPreview` | Preview expired / not found, permission denied                                         |
| `remove`             | Skill not found, permission denied                                                     |
| `enable` / `disable` | File not found, permission denied                                                      |

Git authentication: for v1, rely on the user's existing git credentials (SSH keys, credential helper). If `git clone` fails, surface the raw git error message to the user.

### Install Metadata Tracking

When a skill is installed, write a `.neovate-install.json` file into the skill directory:

```json
{
  "installedFrom": "npm:@claude-skills/pr-apply@1.2.0",
  "version": "1.2.0",
  "source": "npm",
  "installedAt": "2026-03-14T10:30:00Z"
}
```

This file is used for:

- Showing version info in the detail modal and skill row
- Checking for updates (`checkUpdates` compares `version` with the latest from the source)
- Knowing the source for one-click updates

Version resolution per source:

- **npm**: package version from `package.json` or registry
- **git**: commit SHA (short) or tag name if available
- **prebuilt**: app version at time of install

The `SkillInstaller` interface gains an optional version method:

```ts
interface SkillInstaller {
  // ... existing methods ...
  getLatestVersion?(sourceRef: string): Promise<string | undefined>;
}
```

`checkUpdates` iterates installed skills with `installedFrom` metadata, dispatches to the matching installer's `getLatestVersion`, and compares with the stored version. This is extensible — new installer types automatically participate in update checking by implementing `getLatestVersion`.

### Version Display in UI

- **Skill row**: show version badge next to scope badge if available: `pr-apply [global] [v1.2.0] [on/off]`
- **Detail modal**: show version in metadata section, plus `[Update available: v1.3.0]` button if an update is found
- **Recommended list**: show version next to source if available: `source: npm v1.2.0`

### Enable/Disable Mechanism

- **Disable**: rename `SKILL.md` to `SKILL.md.disabled` in the skill directory
- **Enable**: rename `SKILL.md.disabled` back to `SKILL.md`
- When scanning, detect both files to determine enabled state
- Claude Code only discovers `SKILL.md`, so disabled skills are invisible to it

### Installed Skills Discovery

Scan directories for subdirectories containing `SKILL.md` or `SKILL.md.disabled`:

- Global: `~/.claude/skills/*/`
- Project: `<projectPath>/.claude/skills/*/`

Note: legacy `.claude/commands/*.md` files are NOT handled — they are not skills.

### Recommended Skills Sources

1. **Prebuilt**: hardcoded manifest in `prebuilt-manifest.ts` (array of `{ name, description, sourceRef }`)
2. **Remote**: fetched from configurable registry URL (future, extensible)

The recommended list is the union of all sources, deduplicated by name, with `installed: true` marked for skills already installed in any scope.

### Prebuilt Skills Manifest

Initial prebuilt skills (can be empty array at launch, filled in as skills are bundled):

```ts
// main/features/skills/prebuilt-manifest.ts

export const PREBUILT_SKILLS: RecommendedSkill[] = [
  // Add entries as skills are bundled with the app, e.g.:
  // { name: "pr-apply", description: "Apply PR changes to codebase", source: "prebuilt", sourceRef: "prebuilt:pr-apply", installed: false },
];
```

Prebuilt skill content is stored in the app's `resources/skills/<name>/` directory.

## Integration Points

- Register `skillsContract` in `shared/contract.ts`
- Register `skillsRouter` in `main/router.ts`
- Add `SkillsService` to `AppContext` dependencies
- Project list comes from existing `projectStore` via oRPC
- Open Folder uses Electron `shell.showItemInFolder()`
- Uninstall confirmation uses existing AlertDialog UI component

## TODO (Future)

- **Active session cache invalidation**: After skill mutations (install/remove/enable/disable), notify running Claude Code sessions to clear their internal skill cache (`jc8()` in CLI). Without this, users need to restart their session to pick up changes.
- **File watcher**: Watch `~/.claude/skills/` and project `.claude/skills/` for external changes (e.g. user adds skills via CLI or Finder) and auto-refresh the UI.
- **Remote registry**: Fetch recommended skills from a configurable registry API endpoint for community/marketplace skills.

## Existing Code

The current `skills-panel.tsx` has stub APIs (`skillsApi.list/preview/install/remove`) with the right shape but no backend. This design replaces the stubs with real oRPC calls and restructures the UI into:

- `skills-panel.tsx` — marketplace layout with installed/recommended sections
- `skill-detail-modal.tsx` — detail view with conditional install/uninstall actions
- `skill-add-modal.tsx` — multi-step "Add from URL/package" flow
