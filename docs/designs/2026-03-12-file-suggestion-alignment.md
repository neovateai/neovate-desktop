# File Suggestion Alignment with Claude Code

**Date**: 2026-03-12
**Status**: Draft (v4)

## Problem

The `@` file suggestion feature in neovate-desktop diverges from claude-code in several critical ways:

| Aspect                | Claude Code                                             | Neovate                                                        | Impact                                         |
| --------------------- | ------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------- |
| Empty query (`@`)     | Lists top-level dirs/files                              | Returns ALL files via `rg --files --iglob "**"`                | Floods user with irrelevant results            |
| Search algorithm      | In-memory fuzzy (Rust index + Fuse.js fallback)         | `rg --files --iglob "*{query}*"` per keystroke                 | No fuzzy matching, slow per-keystroke spawning |
| Directory suggestions | Dirs listed with trailing `/`, drill-down on select     | No directory suggestions (`rg --files` only returns files)     | Can't navigate by folder                       |
| Directory drill-down  | Selecting a dir continues autocomplete within it        | N/A                                                            | Can't progressively narrow by folder           |
| Path-prefix queries   | `@src/feat` filters to `src/` then fuzzy-matches `feat` | Glob matches `*src/feat*` as substring                         | Poor results for path-like queries             |
| Query normalization   | Strips `./` prefix before searching                     | No normalization                                               | `@./src` fails to match                        |
| Ranking               | Weighted fuzzy: filename×2, path×1, test penalty        | Alphabetical sort                                              | `__tests__/foo.ts` shown before `src/foo.ts`   |
| Gitignore             | Respects `.gitignore` via `git ls-files`                | Hard-coded exclusions: `node_modules`, `.git`, `dist`, `build` | Shows ignored files, misses custom exclusions  |
| Performance           | One-time file collection, cached in-memory index        | Spawns `rg` process per keystroke                              | Latency on every keypress                      |

## Claude Code Architecture

Claude Code ships a native Rust `.node` addon (`FileIndex`) that provides:

- `loadFromFileList(paths: string[])` — builds in-memory search index
- `search(query: string, limit: number)` — returns `{ path, score }[]`

When Rust is unavailable, it falls back to **Fuse.js** with identical behavior. The Rust addon is a speed optimization, not a functional requirement.

### File Collection Pipeline

```
1. git ls-files --recurse-submodules        → tracked files
2. git ls-files --others --exclude-standard  → untracked (background)
3. .ignore / .rgignore patterns              → filter both lists
4. Extract parent directories with trailing "/"
   e.g. "src/features/agent/router.ts" →
     ["src/", "src/features/", "src/features/agent/"]
5. Combined list → FileIndex.loadFromFileList([files + dirs])
```

### Search Behavior

```
if (query == "" || "." || "./"):
  → readdir(cwd) → top-level entries, dirs get trailing "/"
  → limit 15

else:
  → Normalize: strip "./" prefix
  → If query ends with "/": scoped readdir(cwd + prefix)
    e.g. @src/ → readdir("src/") → top-level entries of src/
  → If query contains "/": pre-filter file list to matching directory prefix,
    then fuzzy-match only the remainder after the last "/"
  → Fuse.js search:
    keys: [{name: "filename", weight: 2}, {name: "path", weight: 1}]
    threshold: 0.5
  → Sort by score, penalize test directories
  → limit 15
```

## Proposed Design

### Scope

**Files that change:**

| File                              | Change                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `search-paths.ts` (main)          | Replace rg-per-query with cached file index + Fuse.js                         |
| `mention-extension.ts` (renderer) | Handle directory drill-down (replace query text instead of inserting mention) |
| `suggestion-list.tsx` (renderer)  | Add folder icon for directory items                                           |
| `package.json`                    | Add `fuse.js` dependency                                                      |

**No changes to:**

- `contract.ts` — same `{ paths: string[]; truncated: boolean }` shape

### 1. New `search-paths.ts` — Backend

```typescript
import Fuse from "fuse.js";
import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";

// --- Types ---

type FileEntry = {
  path: string;
  filename: string;
  testPenalty: number; // 0 or 1
};

type FileCache = {
  cwd: string;
  entries: FileEntry[];
  fuse: Fuse<FileEntry>;
  builtAt: number;
  building: Promise<void> | null; // background rebuild lock
};

// --- Cache (single active cwd) ---

let cache: FileCache | null = null;

// Rebuild when file list changes (cwd change), not on a fixed timer.
// git ls-files is ~20ms even for large repos, so we can afford to
// re-check on every query and compare the result.

// --- File collection ---

async function gitLsFiles(cwd: string): Promise<string[] | null> {
  // Returns null if not a git repo or git fails
  try {
    const tracked = await execGit(
      ["-c", "core.quotepath=false", "ls-files", "--recurse-submodules"],
      cwd,
    );
    if (tracked === null) return null;

    // Background: merge untracked files
    const untracked = await execGit(
      ["-c", "core.quotepath=false", "ls-files", "--others", "--exclude-standard"],
      cwd,
    );

    const files = [...tracked];
    if (untracked) files.push(...untracked);
    return files;
  } catch {
    return null;
  }
}

async function rgFallback(cwd: string): Promise<string[]> {
  // One-time fallback for non-git repos
  // rg --files --hidden --glob '!.git/' <cwd>
  // Convert absolute paths to relative
}

async function collectFiles(cwd: string): Promise<string[]> {
  const gitFiles = await gitLsFiles(cwd);
  const files = gitFiles ?? (await rgFallback(cwd));
  const dirs = extractParentDirs(files);
  return [...new Set([...files, ...dirs])];
}

function extractParentDirs(files: string[]): string[] {
  const dirs = new Set<string>();
  for (const file of files) {
    let dir = dirname(file);
    while (dir !== "." && !dirs.has(dir)) {
      dirs.add(dir);
      dir = dirname(dir);
    }
  }
  return [...dirs].map((d) => d + sep);
}

// --- Fuse.js index ---

function buildIndex(fileList: string[]): { entries: FileEntry[]; fuse: Fuse<FileEntry> } {
  const entries = fileList.map((p) => ({
    path: p,
    filename: basename(p),
    testPenalty: p.includes("test") ? 1 : 0,
  }));
  const fuse = new Fuse(entries, {
    includeScore: true,
    threshold: 0.5,
    keys: [
      { name: "path", weight: 1 },
      { name: "filename", weight: 2 },
    ],
  });
  return { entries, fuse };
}

async function getOrBuildCache(cwd: string): Promise<FileCache> {
  if (cache && cache.cwd === cwd) return cache;

  const fileList = await collectFiles(cwd);
  const { entries, fuse } = buildIndex(fileList);
  cache = { cwd, entries, fuse, builtAt: Date.now(), building: null };
  return cache;
}

// --- Directory listing (readdir-based) ---

async function listDirectory(
  cwd: string,
  dirPrefix: string, // "" for top-level, "src/" for scoped
  maxResults: number,
): Promise<{ paths: string[]; truncated: boolean }> {
  const target = dirPrefix ? join(cwd, dirPrefix) : cwd;
  const entries = await readdir(target, { withFileTypes: true });
  const paths = entries
    .map((e) => {
      const name = e.isDirectory() ? e.name + sep : e.name;
      return dirPrefix ? dirPrefix + name : name;
    })
    .sort();
  return {
    paths: paths.slice(0, maxResults),
    truncated: paths.length > maxResults,
  };
}

// --- Query normalization ---

function normalizeQuery(query: string): string {
  // Strip "./" prefix
  if (query.startsWith("./")) return query.slice(2);
  if (query === ".") return "";
  return query;
}

// --- Public API (same signature) ---

export async function searchPaths(
  cwd: string,
  query: string,
  maxResults = 15,
): Promise<{ paths: string[]; truncated: boolean }> {
  const q = normalizeQuery(query);

  // Empty or "." → show top-level directory listing
  if (q === "") {
    return listDirectory(cwd, "", maxResults);
  }

  // Trailing "/" → scoped directory listing (e.g. @src/ → contents of src/)
  // This is critical for drill-down: user selects "src/" → query becomes "src/"
  // → show contents of src/ instead of fuzzy-searching for "src/"
  // Wrapped in try/catch: readdir throws if dir was deleted or is unreadable.
  if (q.endsWith(sep)) {
    try {
      return await listDirectory(cwd, q, maxResults);
    } catch {
      return { paths: [], truncated: false };
    }
  }

  const index = await getOrBuildCache(cwd);

  // Path-prefix filtering: if query contains "/",
  // narrow the search set to entries under that directory prefix
  let searchSet = index.entries;
  const lastSep = q.lastIndexOf(sep);
  if (lastSep > 0) {
    const dirPrefix = q.substring(0, lastSep);
    searchSet = searchSet.filter((e) => e.path.substring(0, lastSep).startsWith(dirPrefix));
  }

  // Fuzzy search (build a temporary Fuse if we filtered)
  const fuse =
    searchSet === index.entries
      ? index.fuse
      : new Fuse(searchSet, {
          includeScore: true,
          threshold: 0.5,
          keys: [
            { name: "path", weight: 1 },
            { name: "filename", weight: 2 },
          ],
        });

  const results = fuse.search(q, { limit: maxResults });

  // Sort: by score first, penalize test dirs when scores are close
  results.sort((a, b) => {
    if (a.score === undefined || b.score === undefined) return 0;
    if (Math.abs(a.score - b.score) > 0.05) return a.score - b.score;
    return a.item.testPenalty - b.item.testPenalty;
  });

  const paths = results.map((r) => r.item.path);
  return { paths, truncated: false };
}

// Invalidate cache (call on cwd change from session management)
export function invalidateFileCache(): void {
  cache = null;
}
```

### 2. Directory Drill-Down — Renderer

When a user selects a directory from the suggestion list, we do NOT insert it as a mention. Instead, we replace the current query text with the directory path so the user can keep drilling into subdirectories.

**How it works with Tiptap's suggestion plugin:**

The suggestion plugin (`@tiptap/suggestion`) calls `findSuggestionMatch` on every transaction. After we replace `@query` with `@dir/`:

1. Cursor lands at end of `@dir/`
2. `findSuggestionMatch` regex `@[^\s@]*` matches → new query = `dir/`
3. Plugin detects `prev.query !== next.query` → triggers `handleChange` → calls `items()` with new query
4. Backend receives `dir/` → trailing-slash case → returns `readdir` of that directory

**Important**: Use `insertContentAt(range, ...)` as a single atomic operation instead of `deleteRange` + `insertContent`. The suggestion plugin checks if the cursor falls outside `prev.range` between transactions — a two-step operation risks the cursor landing outside the range momentarily, which would deactivate the suggestion (see `suggestion.ts:428`).

**`mention-extension.ts` changes:**

The existing `fileName` / `dirName` helpers break on trailing-slash paths (directories).
`fileName("src/features/agent/")` returns `""` because `lastIndexOf("/")` matches the
trailing slash. Must strip trailing `/` before parsing:

```typescript
// Fix: strip trailing "/" before parsing
function fileName(p: string): string {
  const clean = p.endsWith("/") ? p.slice(0, -1) : p;
  const i = clean.lastIndexOf("/");
  return i === -1 ? clean : clean.slice(i + 1);
}

function dirName(p: string): string {
  const clean = p.endsWith("/") ? p.slice(0, -1) : p;
  const i = clean.lastIndexOf("/");
  return i <= 0 ? "" : clean.slice(0, i);
}

// Now:
// fileName("src/features/agent/") → "agent"     (was "")
// dirName("src/features/agent/")  → "src/features" (was "src/features/agent")
```

```typescript
// In the suggestion config:
suggestion: {
  items: async ({ query }) => {
    // ... same searchPaths call, with debounce (see section 5) ...
    return paths.map((p) => ({
      id: p,
      label: p,
      title: fileName(p),
      description: dirName(p),
      isDirectory: p.endsWith("/"),  // NEW: flag directories
    }));
  },

  command: ({ editor, range, props }) => {
    const item = props as SuggestionItem;

    if (item.isDirectory) {
      // DRILL-DOWN: atomically replace @query with @dir/ to re-trigger suggestion
      // Must be a single insertContentAt — NOT deleteRange + insertContent
      // (see "Important" note above about suggestion plugin range tracking)
      editor
        .chain()
        .focus()
        .insertContentAt(range, `@${item.label}`)
        .run();
      return;
    }

    // Normal file: insert as mention node
    editor
      .chain()
      .focus()
      .insertContentAt(range, [
        { type: "mention", attrs: { id: item.id, label: item.label } },
        { type: "text", text: " " },
      ])
      .run();
  },
}
```

Note: This requires overriding the default `command` in the Mention extension's suggestion config, instead of relying on the default behavior. The `range` parameter gives us the exact position of `@query` in the editor so we can replace it.

**`suggestion-list.tsx` changes:**

```typescript
// Add isDirectory to SuggestionItem type
export type SuggestionItem = {
  id?: string;
  label: string;
  title?: string;
  description?: string;
  isDirectory?: boolean;  // NEW
};

// In the render: folder icon + drill-down chevron for directories
{icon && (
  <span className="shrink-0 text-muted-foreground">
    {item.isDirectory ? <Folder className="h-4 w-4" /> : icon}
  </span>
)}
<span className="shrink-0">{item.title ?? item.label}</span>
{item.description && (
  <span className="min-w-0 truncate text-muted-foreground text-xs">
    {item.description}
  </span>
)}
{/* Spacer to push chevron to the right */}
{item.isDirectory && (
  <>
    <span className="flex-1" />
    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
  </>
)}
```

The `ChevronRight` icon is a visual hint that selecting this item drills into the directory rather than inserting a mention.

### 3. Cache Strategy

Instead of a fixed TTL, use a **single-cwd cache** that invalidates on cwd change:

- `cache` is a single object (not a Map), since only one cwd is active at a time
- Rebuilt when `cwd` changes (compared by string equality)
- Exposed `invalidateFileCache()` for explicit invalidation from session management
- `git ls-files` is fast (~20ms), so rebuilding on cwd change is cheap
- No background polling or file watching — YAGNI

### 4. Large Repo Optimization

- The Fuse.js instance is kept alive in the cache — not rebuilt per query
- For path-prefix queries, a temporary Fuse instance is built only for the filtered subset
- For repos with 50k+ files, Fuse.js index build is ~100-200ms (one-time cost on cwd change)

### 5. Debounce on IPC

Every keystroke triggers `client.utils.searchPaths()` — an IPC round-trip to the main process. Even though the backend search is now in-memory, the IPC overhead itself is per-keystroke. Add a debounce in `mention-extension.ts`.

**Important**: The debounce must not leave dangling Promises. Tiptap's suggestion plugin
`await`s the `items` function — if a previous Promise never resolves (e.g. timer cleared
without resolving), the plugin hangs. Use a version counter instead:

```typescript
// In mention-extension.ts — outside the suggestion config:
let searchVersion = 0;

// In the suggestion config:
items: async ({ query }) => {
  const cwd = getCwd();
  if (!cwd) return [];

  const version = ++searchVersion;

  // Debounce: wait 100ms for typing to settle
  await new Promise(r => setTimeout(r, 100));
  if (version !== searchVersion) return []; // superseded by newer keystroke

  try {
    const { paths } = await client.utils.searchPaths({
      cwd,
      query,
      maxResults: 15,
    });
    if (version !== searchVersion) return []; // superseded while awaiting IPC
    return paths.map((p) => ({
      id: p,
      label: p,
      title: fileName(p),
      description: dirName(p),
      isDirectory: p.endsWith("/"),
    }));
  } catch {
    return [];
  }
},
```

How it works: each keystroke increments `searchVersion`. After the 100ms sleep, if
`searchVersion` has changed, a newer keystroke has arrived — return `[]` immediately
(no hanging Promise). The check after `await searchPaths` catches cases where a new
keystroke arrived during the IPC round-trip. Tiptap receives `[]` for stale queries
and the real results for the latest query.

## What This Fixes

| Gap                                  | Fix                                                             |
| ------------------------------------ | --------------------------------------------------------------- |
| Empty `@` shows all files            | `listDirectory(cwd, "")` → top-level dirs/files                 |
| `@src/` returns garbage              | Trailing-slash detection → scoped `listDirectory(cwd, "src/")`  |
| No directory suggestions             | Parent dirs extracted and indexed with trailing `/`             |
| No directory drill-down              | Selecting dir atomically replaces query, re-triggers suggestion |
| Drill-down may deactivate suggestion | Use single `insertContentAt` instead of delete+insert           |
| No fuzzy matching                    | Fuse.js with weighted filename/path scoring                     |
| No relevance ranking                 | Score-based sort with test penalty                              |
| Path-prefix queries broken           | Pre-filter by dir prefix before fuzzy matching                  |
| `@./` not normalized                 | Strip `./` prefix before searching                              |
| Doesn't respect .gitignore           | `git ls-files` instead of hard-coded exclusions                 |
| Spawns rg per keystroke              | One-time file collection, in-memory search                      |
| IPC spam on fast typing              | Version-counter debounce (100ms, no dangling Promises)          |
| Dirs not visually distinct           | Folder icon + `ChevronRight` hint for drill-down                |
| Dir titles render empty              | `fileName`/`dirName` strip trailing `/` before parsing          |
| `listDirectory` can throw            | try/catch around scoped readdir, returns `[]` on error          |

## What This Does NOT Change

- No `~` expansion or `@"quoted paths"` (Tiptap mention doesn't support these)
- No Rust native addon (Fuse.js is sufficient)
- No agent or MCP resource suggestions (separate feature)
- Contract shape unchanged (`{ paths, truncated }`)
