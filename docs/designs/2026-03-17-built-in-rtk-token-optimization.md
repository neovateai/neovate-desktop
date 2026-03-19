# Built-in RTK Token Optimization via SDK Hooks

**Date:** 2026-03-17
**Status:** Approved

## Problem

LLM token consumption on common developer commands (git status, cargo test, etc.) is wasteful — Claude receives full unfiltered output when it only needs a summary. RTK (Rust Token Killer) solves this with a CLI proxy that filters output for 60-90% token savings, but currently requires separate installation and manual hook configuration.

## Solution

Bundle the `rtk` binary inside neovate-desktop and register a `PreToolUse` SDK hook that rewrites Bash commands through RTK automatically. Zero user setup required.

## Architecture

```
session-manager.ts
  initSession() builds Options
    options.hooks = {
      PreToolUse: [{ matcher: "Bash", hooks: [preToolUseHook] }]
    }

preToolUseHook (TypeScript callback):
  1. Fast skip: if command starts with "rtk " or contains "<<", return { continue: true }
  2. Call bundled `rtk rewrite <cmd>` (5s timeout, graceful fallback on error)
  3. If rewrite differs: return { permissionDecision: "allow", updatedInput: { command: rewrittenCmd } }
  4. If no rewrite or error: return { continue: true }

permissionDecision: "allow" is required because the rewrite changes the command
prefix (e.g. "git status" -> "rtk git status"), which breaks settings-based
allow-lists like Bash(git:*). The rewritten command is functionally identical
to the original — same operation, just filtered output — so auto-allowing is safe.
Without this, every rewritten command would trigger a permission prompt in the UI.
```

## Data Flow

```
1. Claude decides: Bash({ command: "git status" })
2. SDK fires PreToolUse hook (matcher: "Bash")
3. Hook calls: rtk rewrite "git status" -> "rtk git status"
4. Hook returns updatedInput with rewritten command
5. SDK executes: "rtk git status" (rtk runs git, filters output)
6. Filtered output returned to Claude (60-90% fewer tokens)
7. UI shows the filtered output in BashTool component
```

## Components

### 1. Binary Bundling (mirrors bun pattern)

| Item             | Path                           | Details                                                                         |
| ---------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| Download script  | `scripts/download-rtk.ts`      | Fetch from GitHub releases, verify SHA256, place in `vendor/rtk/rtk`            |
| Vendor dir       | `vendor/rtk/`                  | `.gitignored`, populated by download script                                     |
| electron-builder | `configs/electron-builder.mjs` | `extraResources: [{ from: "vendor/rtk", to: "rtk", filter: ["rtk"] }]`          |
| Path resolver    | `claude-code-utils.ts`         | `resolveRtkPath()`: dev -> `"rtk"` from PATH, prod -> `{resourcesPath}/rtk/rtk` |

### 2. SDK Hook Registration (session-manager.ts)

The hook is constructed in `initSession()` (not `queryOptions()`) because it closes over the resolved `env` object built there.

```typescript
// In initSession(), after building env:
const rtkPath = resolveRtkPath();
const rtkLog = debug("neovate:rtk");

const rtkHook: HookCallback = async (input) => {
  const cmd = (input.tool_input as any)?.command;
  if (!cmd) return { continue: true };

  // Fast skip: commands RTK never rewrites
  if (cmd.startsWith("rtk ") || cmd.includes("<<")) {
    return { continue: true };
  }

  try {
    const { stdout } = await execFileAsync(rtkPath, ["rewrite", cmd], {
      timeout: 5000,
      env, // full session env (includes merged PATH, HOME, etc.)
    });
    const rewritten = stdout.trim();

    if (!rewritten || rewritten === cmd) {
      rtkLog("no rewrite: %s", cmd);
      return { continue: true };
    }

    rtkLog("rewrite: %s -> %s", cmd, rewritten);
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse" as const,
        permissionDecision: "allow" as const,
        updatedInput: { command: rewritten },
      },
    };
  } catch (err: any) {
    if (err?.code === 1 || err?.status === 1) {
      // Normal: rtk rewrite exits 1 when no rewrite applies
      rtkLog("no rewrite: %s", cmd);
    } else {
      // Actual error: binary missing (ENOENT), timeout (ETIMEDOUT), crash
      rtkLog("fallback (error): %s — %s", cmd, err?.message ?? err);
    }
    return { continue: true };
  }
};

// Add to options.hooks only if enabled and no file-based RTK hook exists
const options: Options = {
  ...queryOpts,
  hooks: registerRtkHook ? { PreToolUse: [{ matcher: "Bash", hooks: [rtkHook] }] } : undefined,
  // ... rest of options
};
```

### 3. Settings Toggle

- New config key: `tokenOptimization: boolean` (default: `true`)
- When `false`, the `PreToolUse` hook is not registered
- UI toggle in Settings > Chat panel (default enabled)

### 4. Deduplication with File-Based RTK Hooks

Users who previously installed RTK via `rtk init` have a file-based hook in `~/.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/rtk-rewrite.sh" }]
      }
    ]
  }
}
```

The SDK loads both programmatic hooks and file-based hooks. To avoid double-rewriting (two subprocess spawns, fragile ordering), the hook registration logic checks for existing RTK hooks:

```typescript
// In initSession(), before building options:
const hasFileBasedRtkHook = await detectRtkHookInSettings(cwd);
const registerRtkHook = configStore.get("tokenOptimization") !== false && !hasFileBasedRtkHook;
```

`detectRtkHookInSettings()` reads `~/.claude/settings.json` and checks if any PreToolUse hook command contains `rtk`. If found, the programmatic hook is skipped — the user's existing file-based hook handles rewriting.

### 5. RTK Environment

The hook ensures RTK inherits the session's merged PATH (bundled bun dir + shell env + process env) so it can find git, cargo, etc.

RTK also needs its own PATH entry so `rtk git status` works. The bundled rtk binary directory is prepended to PATH alongside bun's directory in `initSession()`.

RTK reads user config from `~/.config/rtk/config.toml` (e.g. `exclude_commands`) and writes analytics to `~/.local/share/rtk/history.db`. Both paths are respected automatically by the bundled binary — no special handling needed. The shared analytics database means `rtk gain` from the CLI shows unified stats across CLI and desktop usage.

### 6. Dev Mode Fallback

In dev mode, `resolveRtkPath()` returns `"rtk"` (system PATH lookup). If a developer doesn't have RTK installed, the `try/catch` around `execFileAsync` ensures the hook silently falls back to passthrough — no errors, no degraded experience, just no token optimization.

### 7. Debug Logging

Use `debug("neovate:rtk")` for observability:

- Hook registration: `"rtk hook registered"` / `"rtk hook skipped (disabled)"` / `"rtk hook skipped (file-based hook detected)"`
- Each rewrite: `"rewrite: git status -> rtk git status"` / `"no rewrite: echo hello"`
- Errors: `"fallback (error): git status — Error: rtk not found"`

## What We're NOT Doing

- No PostToolUse hook (RTK filters during execution, not after)
- No TOML filter porting to TypeScript (use RTK's built-in filters)
- No RTK analytics UI in v1 (can add later via `rtk gain --format json`)
- No `rtk init` or settings.json patching (we use SDK programmatic hooks, not file-based hooks)
- No conflict with user's own RTK hooks (detected at session init and programmatic hook is skipped — see section 4)

## Implementation Order

1. `scripts/download-rtk.ts` — download script (model after `download-bun.ts`)
2. `claude-code-utils.ts` — add `resolveRtkPath()` + `detectRtkHookInSettings()`
3. `configs/electron-builder.mjs` — add rtk to `extraResources`
4. `session-manager.ts` — register PreToolUse hook in `initSession()` (with dedup check, fast skip, timeout, error handling)
5. `initSession()` — prepend rtk binary dir to merged PATH
6. Config types + store — add `tokenOptimization` boolean
7. Settings UI — add toggle in Agent panel

## RTK Release Tracking

RTK releases at https://github.com/rtk-ai/rtk/releases. The download script should pin a specific version (like bun pins via `packageManager` field). Store the RTK version in `package.json` under a custom field or in the download script itself.

## Platform Support

RTK provides binaries for:

- `darwin/arm64` (Apple Silicon)
- `darwin/x64` (Intel Mac)
- `linux/x64`
- `linux/arm64`

Match against neovate-desktop's current platform support (darwin only for now).
