# Global Shell Environment Resolver

## Problem

Electron GUI-launched apps inherit minimal PATH from `launchd` (macOS): `/usr/bin:/bin:/usr/sbin:/sbin`. User-installed tools (node, bun, git, npm, etc.) are not available to subprocesses.

The codebase has **two separate shell env extraction services** with different approaches:

1. `features/agent/shell-env.ts` — spawns `zsh -c "source ~/.zshrc; env"`, filters to a whitelist of vars (PATH, NVM_DIR, etc.), caches with retry cooldown
2. `plugins/terminal/shell-env-service.ts` — spawns `zsh -l -c "env"`, captures all vars, caches per shell path

And **many subprocess callsites** with inconsistent PATH handling:

| Callsite                               | Current behavior                                                    |
| -------------------------------------- | ------------------------------------------------------------------- |
| `session-manager.ts` (agent SDK)       | Manually merges shellEnv.PATH + process.env.PATH + bundled bin dirs |
| `pty-manager.ts` (terminal)            | Uses ShellEnvService, falls back to process.env                     |
| `utils/router.ts` (openIn, detectApps) | Calls getShellEnvironment(), spreads over process.env               |
| `skills/installers/git.ts`             | Bare execFile("git") — **no PATH fix**                              |
| `skills/installers/npm.ts`             | Bare execFile("npm") — **no PATH fix**                              |
| `utils/search-paths.ts`                | Bare execFile("git") — **no PATH fix**                              |
| `utils/search-content.ts`              | Bare execFile with bundled rg — works, but git fallback broken      |

## Approach

Single `ShellEnvironmentService` class (same name as VS Code's) with two access paths:

1. **Internal code** — imports singleton `shellEnvService` from `core/shell-service.ts`
2. **Third-party plugins** — receives the same instance as `ctx.shell` on `PluginContext`

All consumers call `getEnv()` async when needed. No startup blocking. The cache is warmed eagerly at module load — by the time any user action triggers a subprocess, it resolves instantly.

Reference: VS Code's `src/vs/platform/shell/node/shellEnv.ts` ([source](https://github.com/microsoft/vscode/blob/main/src/vs/platform/shell/node/shellEnv.ts)) and `IShellEnvironmentService` ([source](https://github.com/microsoft/vscode/blob/main/src/vs/workbench/services/environment/electron-browser/shellEnvService.ts)).

## Design

### New module: `src/main/core/shell-service.ts`

#### Class

```typescript
export interface IShellEnvironmentService {
  getEnv(): Promise<Record<string, string>>;
}

class ShellEnvironmentService implements IShellEnvironmentService {
  getEnv(): Promise<Record<string, string>>;
  /** For testing only. */
  _resetForTesting(): void;
}

/** Singleton instance. Imported by internal code, wired to ctx.shell for plugins. */
export const shellEnvService = new ShellEnvironmentService();
```

#### Shell detection

Copy VS Code's `getSystemShellUnixLike()` from `src/vs/base/node/shell.ts` (lines 28-62).

#### Shell spawning

Copy VS Code's `doResolveUnixShellEnv()` from `src/vs/platform/shell/node/shellEnv.ts` (lines 102-222). Adapt:

- Replace `VSCODE_RESOLVING_ENVIRONMENT` with `NEOVATE_RESOLVING_ENVIRONMENT`
- Remove VS Code-specific imports (use Node.js `crypto.randomUUID()` instead of `generateUuid()`, etc.)
- Add `DISABLE_AUTO_UPDATE=true` and `ZSH_TMUX_AUTOSTARTED=true` to spawn env (Oh My Zsh / tmux noise suppression)

#### Caching

Instance-level promise, same pattern as VS Code (line 22):

```typescript
class ShellEnvironmentService {
  #cachedPromise: Promise<Record<string, string>> | undefined;

  getEnv(): Promise<Record<string, string>> {
    if (!this.#cachedPromise) {
      this.#cachedPromise = this.#doResolve();
    }
    return this.#cachedPromise;
  }
}
```

#### Error handling

- **Timeout (10s)**: Log error, return `process.env` as fallback. App still functional but some tools may be missing.
- **Shell spawn fails**: Same — log and return `process.env`.
- **No retry**: If the user's shell is broken at launch, it stays broken until app restart. Matches VS Code's behavior.
- **Never rejects**: The promise always resolves. Callers don't need try/catch.

#### Logging

Log with `debug("neovate:shell-env")`. Never log env values except PATH — env may contain secrets (API keys, tokens).

```
neovate:shell-env  detected shell: /bin/zsh
neovate:shell-env  spawning: /bin/zsh -i -l -c '<command>'
neovate:shell-env  resolved in 245ms
neovate:shell-env  PATH: /opt/homebrew/bin:/Users/x/.nvm/versions/node/v22.0.0/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin
neovate:shell-env  env keys: HOME, SHELL, PATH, NVM_DIR, VOLTA_HOME, LANG, ...
neovate:shell-env  stderr: <any shell startup noise>
```

On failure:

```
neovate:shell-env  ERROR: shell exited with code 1, signal null
neovate:shell-env  ERROR: timed out after 10000ms
neovate:shell-env  falling back to process.env
```

### Plugin context: `ctx.shell`

Third-party plugins can't import `core/shell-service.ts`. They receive the singleton via the minimal `IShellEnvironmentService` interface on `ctx.shell`:

```typescript
// core/plugin/types.ts
import type { IShellEnvironmentService } from "../shell-service"

interface PluginContext {
  orpcServer: ...
  shell: IShellEnvironmentService
}
```

Plugin usage:

```typescript
const plugin: MainPlugin = {
  async spawnSomething(ctx) {
    const env = await ctx.shell.getEnv();
    spawn("git", ["status"], { env });
  },
};
```

### Startup integration: `src/main/index.ts`

```typescript
import "./core/logger";
import { shellEnvService } from "./core/shell-service";

// Fire immediately at module load to warm the cache.
// Does NOT block startup — resolves in background (~200-500ms).
shellEnvService.getEnv();

// ... create stores, session manager, etc ...

app.whenReady().then(async () => {
  await mainApp.start(); // no waiting — plugins resolve when needed
  // ...
});
```

### Internal code usage

Features and utils import the singleton directly:

```typescript
import { shellEnvService } from "../../core/shell-service"

// In session-manager
const shellEnv = await shellEnvService.getEnv()
const bunDir = bunPath !== "bun" ? path.dirname(bunPath) : undefined
const rtkDir = rtkPath !== "rtk" ? path.dirname(rtkPath) : undefined
const mergedPath = [rtkDir, bunDir, shellEnv.PATH].filter(Boolean).join(":")
const env = { ...shellEnv, PATH: mergedPath }

// In utils/router.ts
const env = await shellEnvService.getEnv()
spawn(config.cmd, config.args(cwd), { env })

// In skills/installers/git.ts
const env = await shellEnvService.getEnv()
await execFileAsync("git", ["clone", ...], { env })
```

## Files Changed

### New

| File                             | Description                                                           |
| -------------------------------- | --------------------------------------------------------------------- |
| `src/main/core/shell-service.ts` | `ShellEnvironmentService` class — copy VS Code's shell spawning logic |

### Delete

| File                                             | Reason                                |
| ------------------------------------------------ | ------------------------------------- |
| `src/main/features/agent/shell-env.ts`           | Replaced by `ShellEnvironmentService` |
| `src/main/plugins/terminal/shell-env-service.ts` | Replaced by `ShellEnvironmentService` |

### Modify

| File                                         | Change                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/main/core/plugin/types.ts`              | Add `shell: IShellEnvironmentService` to `PluginContext`                                                        |
| `src/main/index.ts`                          | Replace `getShellEnvironment()` with `shellEnvService.getEnv()` (fire-and-forget warm-up)                       |
| `src/main/app.ts`                            | Wire `shellEnvService` into `PluginContext` as `ctx.shell`                                                      |
| `src/main/features/agent/session-manager.ts` | Import `shellEnvService`. Simplify env construction: use `getEnv()`, only prepend bundled bun/rtk dirs to PATH  |
| `src/main/plugins/terminal/pty-manager.ts`   | Remove `ShellEnvService` dependency. Receive `IShellEnvironmentService` via constructor. Shell from `env.SHELL` |
| `src/main/plugins/terminal/index.ts`         | Remove `ShellEnvService` creation and pre-warm. Create PtyManager with `ctx.shell` in `configContributions`     |
| `src/main/features/utils/router.ts`          | Import `shellEnvService`. Replace `getShellEnvironment()` calls                                                 |
| `src/main/features/skills/installers/git.ts` | Add `{ env: await shellEnvService.getEnv() }` to execFile calls                                                 |
| `src/main/features/skills/installers/npm.ts` | Add `{ env: await shellEnvService.getEnv() }` to execFile calls                                                 |
| `src/main/features/utils/search-paths.ts`    | Add `{ env: await shellEnvService.getEnv() }` to execFile("git") call                                           |

## Session Manager Detail

### Before (lines 375-385)

```typescript
const shellEnv = await getShellEnvironment();
const bunPath = resolveBunPath();
const bunDir = bunPath !== "bun" ? path.dirname(bunPath) : undefined;
const rtkPath = resolveRtkPath();
const rtkDir = rtkPath !== "rtk" ? path.dirname(rtkPath) : undefined;
const mergedPath = [rtkDir, bunDir, shellEnv.PATH, process.env.PATH].filter(Boolean).join(":");
const env: Record<string, string | undefined> = {
  ...process.env,
  ...shellEnv,
  ...(mergedPath ? { PATH: mergedPath } : {}),
};
```

### After

```typescript
const shellEnv = await shellEnvService.getEnv();
const bunPath = resolveBunPath();
const bunDir = bunPath !== "bun" ? path.dirname(bunPath) : undefined;
const rtkPath = resolveRtkPath();
const rtkDir = rtkPath !== "rtk" ? path.dirname(rtkPath) : undefined;
const mergedPath = [rtkDir, bunDir, shellEnv.PATH].filter(Boolean).join(":");
const env: Record<string, string | undefined> = {
  ...shellEnv,
  PATH: mergedPath,
};
```

Changes:

- Import `shellEnvService` from `core/shell-service`
- No longer spreads `process.env` — `shellEnv` already contains the full environment
- No longer appends `process.env.PATH` — the shell's PATH already includes system paths

Note: `resolveBunPath()` and `resolveRtkPath()` are still used elsewhere in session-manager (for `executable` option and rtk hook). Only their PATH-related usage is simplified.

## Terminal PTY Detail

### Before

```typescript
// index.ts
const shellEnvService = new ShellEnvService();
const ptyManager = new PtyManager(shellEnvService);
// activate: await shellEnvService.getEnvironment();

// pty-manager.ts
const shell = this.#shellEnvService.getShell();
const shellEnv = this.#shellEnvService.getEnvironmentSync() ?? (process.env as Record<string, string>);
const term = pty.spawn(shell, [], { env: shellEnv, ... });
```

### After

```typescript
// index.ts
let ptyManager: PtyManager | null = null;

export default {
  configContributions(ctx) {
    ptyManager = new PtyManager(ctx.shell);
    return { router: createTerminalRouter(ctx.orpcServer, ptyManager) };
  },
  deactivate: () => ptyManager?.killAll(),
} satisfies MainPlugin;

// pty-manager.ts
import type { PluginContext } from "../../core/plugin/types"

class PtyManager {
  readonly #shell: PluginContext["shell"];
  constructor(shell: PluginContext["shell"]) { this.#shell = shell; }

  async spawn(opts) {
    const env = await this.#shell.getEnv()
    const shell = env.SHELL ?? "/bin/bash"
    const term = pty.spawn(shell, [], { env, ... })
  }
}
```

No separate service, no pre-warming, no sync/async split. PtyManager receives the shell service via `ctx.shell` (DI through `PluginContext`), no direct import from core. Shell path comes from the resolved `env.SHELL` (which the user's shell config sets), with `/bin/bash` as last resort.

## Edge Cases

| Case                                           | Handling                                                      |
| ---------------------------------------------- | ------------------------------------------------------------- |
| nvm (lazy PATH in .zshrc)                      | `-i` flag sources .zshrc — captured                           |
| fnm (`eval "$(fnm env)"` in .zshrc)            | `-i` flag — captured                                          |
| Volta (shims in ~/.volta/bin)                  | `-l` flag sources .zprofile — captured                        |
| Homebrew Apple Silicon (/opt/homebrew)         | `-l` flag sources .zprofile — captured                        |
| conda (init block in .zshrc)                   | `-i` flag — captured                                          |
| Oh My Zsh auto-update noise                    | `DISABLE_AUTO_UPDATE=true` in spawn env                       |
| tmux auto-start                                | `ZSH_TMUX_AUTOSTARTED=true` in spawn env                      |
| Shell outputs ANSI codes                       | UUID delimiter regex ignores surrounding noise                |
| Shell outputs motd/banner                      | UUID delimiter regex extracts JSON cleanly                    |
| path_helper reorders PATH                      | Expected macOS behavior, user's additions still present       |
| $SHELL is /bin/false                           | Fallback to /bin/bash (VS Code pattern)                       |
| $SHELL is unset                                | Fall back to os.userInfo().shell, then /bin/bash              |
| Non-POSIX shells (fish, nu, tcsh, xonsh, pwsh) | Per-shell command/args handling (copied from VS Code)         |
| Shell hangs (misconfigured rc)                 | 10s timeout, log error, return process.env as fallback        |
| Launched from terminal (dev)                   | process.env already correct, resolver still runs (idempotent) |
