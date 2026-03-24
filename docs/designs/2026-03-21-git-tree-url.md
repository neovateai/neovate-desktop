# Git Tree URL Support in GitInstaller

## Problem

The `GitInstaller` doesn't handle GitHub tree URLs with subdirectory paths. When given a URL like `https://github.com/piomin/claude-ai-spring-boot/tree/main/.claude/skills`:

- `normalizeUrl()` passes the tree URL directly to `git clone` → **clone fails**
- `scan()` always scans from repo root — no awareness of subdirectory
- `install()` same issue
- `getLatestVersion()` passes tree URL to `git ls-remote` → **fails**

`extractFolderName()` in `skill-utils.ts` already parses tree URLs for naming purposes, but the actual git operations never use the parsed branch/subpath.

## Scope

**Single file change:** `packages/desktop/src/main/features/skills/installers/git.ts`

No changes to `skill-utils.ts`, `skills-service.ts`, shared types, or renderer UI.

## Design

### New `parseSourceRef()` method

Replace the existing `normalizeUrl(sourceRef): string` with:

```ts
private parseSourceRef(sourceRef: string): { url: string; branch?: string; subpath?: string }
```

**Parsing rules:**

| Input                                                   | url                                | branch | subpath          |
| ------------------------------------------------------- | ---------------------------------- | ------ | ---------------- |
| `user/repo`                                             | `https://github.com/user/repo.git` | —      | —                |
| `https://github.com/user/repo`                          | `https://github.com/user/repo.git` | —      | —                |
| `https://github.com/user/repo.git`                      | `https://github.com/user/repo.git` | —      | —                |
| `https://github.com/user/repo/tree/main`                | `https://github.com/user/repo.git` | `main` | —                |
| `https://github.com/user/repo/tree/main/.claude/skills` | `https://github.com/user/repo.git` | `main` | `.claude/skills` |
| `git:https://example.com/repo.git`                      | `https://example.com/repo.git`     | —      | —                |

**Tree URL regex:** `/^(https?:\/\/[^/]+\/[^/]+\/[^/]+?)(?:\.git)?\/tree\/([^/]+)(?:\/(.+))?$/`

Note: `.git` is stripped before matching the tree path to handle `repo.git/tree/...` URLs. Trailing slashes are stripped from `subpath` to handle URLs like `.../tree/main/.claude/skills/`.

### Updated `scan()` — with sparse checkout optimization

When `subpath` is specified, use sparse checkout to only download files under that path (much faster for large repos):

```ts
async scan(sourceRef: string) {
  const { url, branch, subpath } = this.parseSourceRef(sourceRef);

  if (subpath) {
    // Sparse checkout: only download the subpath
    const args = ["clone", "--depth", "1", "--filter=blob:none", "--sparse"];
    if (branch) args.push("--branch", branch);
    args.push(url, tmpDir);
    await execFileAsync("git", args, { timeout: 60_000, env });
    await execFileAsync("git", ["-C", tmpDir, "sparse-checkout", "set", subpath], {
      timeout: 30_000, env,
    });
    const scanRoot = path.join(tmpDir, subpath);
    return scanSkillDirs(scanRoot);
  } else {
    // Full shallow clone (existing behavior)
    const args = ["clone", "--depth", "1"];
    if (branch) args.push("--branch", branch);
    args.push(url, tmpDir);
    await execFileAsync("git", args, { timeout: 60_000, env });
    return scanSkillDirs(tmpDir);
  }
}
```

### Updated `install()`

Same pattern: parse, clone (sparse if subpath), resolve source from `subpath + skillName`.

### Updated `installFromPreview()`

When subpath is present, skill source paths need to be resolved relative to `subpath` within the clone. The `resolveSkillSource()` call must account for the subpath prefix stored during `scan()`.

Store `subpath` in the preview metadata:

```ts
private previewDirs = new Map<string, { tmpDir: string; sourceRef: string; subpath?: string }>();
```

Then in `installFromPreview()`, prepend subpath when resolving skill source:

```ts
const basePath = preview.subpath ? path.join(preview.tmpDir, preview.subpath) : preview.tmpDir;
const src = resolveSkillSource(basePath, sp);
```

### Updated `getLatestVersion()`

Uses `parsed.url` (clean repo URL without tree path) for `git ls-remote`.

### Conflict handling

Existing behavior in the preview → select → install flow already handles this:

- `scanSkillDirs()` lists what's available
- User picks from the list in the UI
- `installFromPreview()` copies selected skills to target

### User selection

Already handled by the 2-phase preview flow:

1. `scan()` returns `PreviewSkill[]` — user sees checkboxes in `SkillAddModal`
2. User selects which skills to install
3. `installFromPreview()` installs only selected ones

## Known Limitations

- **Branch names with slashes** (e.g., `feature/v2`) are not supported in tree URLs. The parser takes the first path segment after `/tree/` as the branch name. Slashed branches will fail with a clear git clone error. This covers the vast majority of use cases since skill repos rarely use slashed branch names.
