# Terminal Shell Environment Design

**Date:** 2026-03-12
**Status:** Draft

---

## Problem

The current terminal implementation has the following issues:

1. **Incorrect shell environment** — PTY sessions use `process.env` from the Electron main process, which doesn't include user's shell configuration (`.zshrc`, `.bashrc`, etc.)
2. **Missing tool paths** — Tools managed by version managers (nvm, fnm, mise, asdf, etc.) are not in PATH
3. **Different from native terminals** — Users expect terminal behavior to match their native terminal emulator (Terminal.app, iTerm2, etc.)

### Example Impact

```bash
# In Terminal.app or iTerm2:
$ which node
/Users/user/.nvm/versions/node/v22.11.0/bin/node
$ node --version
v22.11.0  # via nvm/fnm

# In Neovate Desktop terminal (current behavior):
$ which node
node not found  # or points to system Node
$ node --version
v18.19.0  # system Node, or "command not found"
```

---

## Overview

Extract the user's real shell environment by spawning a login shell and capturing its environment variables, then pass those to `node-pty` spawns.

**Key insight:** We don't need complex shell wrapper files (superset's approach) if we only care about correct environment. We can extract the environment once and use it directly.

---

## Decision Log

- **Environment extraction method:** Spawn a login shell with `-l` flag and capture `env` output
- **Caching strategy:** Cache extracted environment in memory, invalidate on shell config file changes
- **Timeout:** 5 seconds default to avoid hanging on misconfigured shells
- **Fallback:** Return `process.env` if extraction fails (graceful degradation)
- **No shell wrapper files:** Unlike superset, we don't create `.zshrc` wrapper files — simpler but less powerful
- **Platform support:** macOS only
- **Synchronous vs async:** Async extraction to avoid blocking main process

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Main Process                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  PtyManager.spawn()                                                 │
│    │                                                                │
│    ├─ 1. Get shell environment (cached)                             │
│    │    └─ ShellEnvService.getEnvironment()                        │
│    │         └─ spawn login shell → capture env output              │
│    │                                                                 │
│    ├─ 2. Spawn PTY with extracted env                               │
│    │    └─ pty.spawn(shell, args, { env: extractedEnv })            │
│    │                                                                 │
│    └─ 3. Return sessionId to renderer                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Code Layout

```
main/plugins/terminal/
├── index.ts                    # MainPlugin (existing)
├── router.ts                   # oRPC router (existing)
├── pty-manager.ts              # PtyManager (modify to use ShellEnvService)
├── shell-env-service.ts        # NEW: Shell environment extraction
└── shell-env-service.test.ts   # NEW: Unit tests
```

---

## Implementation

### ShellEnvService Interface

```typescript
// main/plugins/terminal/shell-env-service.ts

interface ShellEnvOptions {
  /** Timeout in milliseconds, default 5000 */
  timeout?: number;
  /** Shell path to use for extraction, auto-detected if not specified */
  shell?: string;
}

interface IShellEnvService {
  /**
   * Extract environment from the user's login shell.
   * Results are cached per shell path.
   */
  getEnvironment(options?: ShellEnvOptions): Promise<Record<string, string>>;

  /**
   * Invalidate cached environment.
   * Call this when user modifies shell config files.
   */
  invalidateCache(): void;

  /**
   * Get the detected shell path.
   */
  getShell(): string;
}
```

### Core Extraction Logic

```typescript
async function extractEnvironment(
  shell: string,
  timeout: number = 5000,
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const env: Record<string, string> = {};

    // Spawn login shell to capture real environment
    // Using -l flag ensures config files are sourced
    const child = spawn(shell, ["-l", "-c", "env"], {
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        // Parse KEY=VALUE format from env output
        for (const line of stdout.split("\n")) {
          const eqIndex = line.indexOf("=");
          if (eqIndex > 0) {
            const key = line.slice(0, eqIndex);
            const value = line.slice(eqIndex + 1);
            env[key] = value;
          }
        }
        resolve(env);
      } else {
        // Fallback to process.env on failure
        console.warn(`[ShellEnv] Extraction failed (exit ${code}): ${stderr}`);
        resolve(process.env as Record<string, string>);
      }
    });

    child.on("error", (error) => {
      console.warn(`[ShellEnv] Extraction error: ${error.message}`);
      resolve(process.env as Record<string, string>);
    });
  });
}
```

### Shell Detection (macOS)

```typescript
function detectShell(): string {
  // Use SHELL environment variable (respects user's default shell)
  if (process.env.SHELL) {
    return process.env.SHELL;
  }

  // Fallback to zsh (macOS default since Catalina)
  return "/bin/zsh";
}
```

### Cached Service Implementation

```typescript
class ShellEnvService implements IShellEnvService {
  private cache = new Map<string, Record<string, string>>();
  private pending = new Map<string, Promise<Record<string, string>>>();
  private readonly shell: string;

  constructor() {
    this.shell = detectShell();
  }

  async getEnvironment(options: ShellEnvOptions = {}): Promise<Record<string, string>> {
    const { shell = this.shell, timeout = 5000 } = options;
    const cacheKey = `${shell}:${timeout}`;

    // Return cached result if available
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!;
    }

    // Return pending promise if extraction is in progress
    if (this.pending.has(cacheKey)) {
      return this.pending.get(cacheKey)!;
    }

    // Extract and cache
    const promise = extractEnvironment(shell, timeout).then((env) => {
      this.cache.set(cacheKey, env);
      this.pending.delete(cacheKey);
      return env;
    });

    this.pending.set(cacheKey, promise);
    return promise;
  }

  invalidateCache(): void {
    this.cache.clear();
    this.pending.clear();
  }

  getShell(): string {
    return this.shell;
  }
}
```

### Modified PtyManager

```typescript
// main/plugins/terminal/pty-manager.ts

export class PtyManager {
  readonly #sessions = new Map<string, PtySession>();
  readonly #shellEnvService = new ShellEnvService();

  spawn(opts: { cwd?: string; cols: number; rows: number }): string {
    const cols = Math.max(1, opts.cols);
    const rows = Math.max(1, opts.rows);
    const shell = this.#shellEnvService.getShell();

    // Get real shell environment (cached)
    const shellEnvPromise = this.#shellEnvService.getEnvironment();

    const publisher = new EventPublisher<{ data: string }>();
    const exitController = new AbortController();

    // Need to handle async environment extraction
    shellEnvPromise.then((shellEnv) => {
      const term = pty.spawn(shell, [], {
        name: "xterm-256color",
        cols,
        rows,
        cwd: opts.cwd ?? process.env.HOME,
        env: shellEnv, // ← Use extracted environment
      });

      term.onData((chunk) => publisher.publish("data", chunk));
      term.onExit(() => exitController.abort());

      const sessionId = crypto.randomUUID();
      this.#sessions.set(sessionId, { pty: term, publisher, exitController });

      // Note: This requires changing the API to be async
      return sessionId;
    });
  }
}
```

**Note:** The above shows the concept. The actual implementation may need a different approach since `spawn()` is currently synchronous. Options:

1. Make `spawn()` async and return `Promise<string>`
2. Pre-warm environment cache on app startup
3. Use `process.env` initially, then restart PTY with correct env

### Recommended Approach: Pre-warm on Startup

```typescript
// main/plugins/terminal/index.ts

export default {
  name: "terminal",
  activate: async (ctx) => {
    // Pre-warm shell environment cache during activation
    const shellEnvService = new ShellEnvService();
    await shellEnvService.getEnvironment(); // Populate cache

    const ptyManager = new PtyManager(shellEnvService);
    // ... rest of activation
  },
  // ...
} satisfies MainPlugin;
```

Then `PtyManager.spawn()` can be synchronous (using cached env):

```typescript
export class PtyManager {
  readonly #sessions = new Map<string, PtySession>();
  readonly #shellEnvService: ShellEnvService;

  constructor(shellEnvService: ShellEnvService) {
    this.#shellEnvService = shellEnvService;
  }

  spawn(opts: { cwd?: string; cols: number; rows: number }): string {
    const cols = Math.max(1, opts.cols);
    const rows = Math.max(1, opts.rows);
    const shell = this.#shellEnvService.getShell();

    // Get cached environment (synchronous if pre-warmed)
    const shellEnv = this.#shellEnvService.getEnvironmentSync();

    const publisher = new EventPublisher<{ data: string }>();
    const exitController = new AbortController();

    const term = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: opts.cwd ?? process.env.HOME,
      env: shellEnv ?? (process.env as Record<string, string>),
    });

    // ... rest of implementation
  }
}
```

---

## Startup Flow

```
App startup
  ↓
TerminalPlugin.activate()
  ↓
ShellEnvService.getEnvironment() // Pre-warm cache
  ↓
[First terminal spawn]
  ↓
PtyManager.spawn()
  ↓
ShellEnvService.getEnvironmentSync() // Returns cached, no delay
  ↓
pty.spawn(shell, [], { env: extractedEnv })
  ↓
PTY runs with correct PATH from user's shell
```

---

## Platform-Specific Behavior

**macOS only** — Default shell is `/bin/zsh`, but users may use bash or fish.

| Shell | Login Flag | Config Files Sourced                                |
| ----- | ---------- | --------------------------------------------------- |
| zsh   | `-l`       | `~/.zshenv`, `~/.zprofile`, `~/.zshrc`, `~/.zlogin` |
| bash  | `-l`       | `~/.profile`, `~/.bashrc`                           |
| fish  | `-l`       | `~/.config/fish/config.fish`                        |

---

## Edge Cases

### 1. Slow Shell Startup

**Problem:** Some users have heavy `.zshrc` files with slow commands (nvm init, pyenv, starship prompt, etc.)

**Solution:** Use 5 second timeout. On timeout, fallback to `process.env` and log a warning.

### 2. Interactive-Only Configuration

**Problem:** Some commands only work in interactive shells (e.g., `[ -t 0 ]` checks)

**Solution:** Our `-l -c 'env'` approach works because:

- `-l` makes it a login shell (sources config files)
- `-c` runs a command (non-interactive)
- Most version managers (nvm, fnm, mise) work in non-interactive login shells

### 3. Shell Config Syntax Errors

**Problem:** User has syntax error in `.zshrc` causing shell to fail

**Solution:** Shell exits with non-zero code, we catch this and fallback to `process.env`

### 4. Fish Shell

**Problem:** Fish has different syntax (`set -x` vs `export`)

**Solution:** Our `env` command approach works regardless of shell syntax — we're capturing the runtime environment, not parsing config files

---

## Testing Strategy

### Unit Tests

```typescript
describe("ShellEnvService", () => {
  it("should parse env output correctly", () => {
    const output = "PATH=/usr/bin\nHOME=/home/user\nSHELL=/bin/zsh";
    const env = parseEnvOutput(output);
    expect(env).toEqual({
      PATH: "/usr/bin",
      HOME: "/home/user",
      SHELL: "/bin/zsh",
    });
  });

  it("should handle multiline values", () => {
    const output = "MULTI=line1\nline2";
    const env = parseEnvOutput(output);
    expect(env.MULTI).toBe("line1");
  });

  it("should fallback to process.env on timeout", async () => {
    const service = new ShellEnvService({ timeout: 1 });
    const env = await service.getEnvironment({ shell: "/bin/sleep" });
    expect(env).toBe(process.env);
  });
});
```

### Integration Tests

Create a fake shell that outputs known environment:

```typescript
// test/fixtures/fake-shell.sh
#!/bin/bash
echo "TEST_VAR=test_value"
echo "TEST_PATH=/fake/path"

// Test that we correctly extract these values
```

### Manual Testing Checklist

- [ ] Verify `nvm` Node.js version is correct
- [ ] Verify `fnm` paths are in PATH
- [ ] Verify `mise`/`asdf` tools work
- [ ] Test with slow `.zshrc` (has `sleep` commands)
- [ ] Test with broken shell config (syntax error)
- [ ] Test after modifying `.zshrc` (cache invalidation)

---

## Future Enhancements

### 1. Multiple Shell Support

Allow user to select shell in UI:

```typescript
interface TerminalConfig {
  shell?: "auto" | "zsh" | "bash" | "fish" | "custom";
  customShellPath?: string;
}
```

### 3. Per-Project Environments

Different environments for different projects (e.g., different Node versions via `.nvmrc`).

### 4. Shell Wrapper Integration

If we need to inject app binaries (e.g., bundled `bun`, custom CLI tools), adopt superset's wrapper approach:

```typescript
function buildTerminalEnv(params: {
  baseEnv: Record<string, string>;
  appBinDir: string;
}): Record<string, string> {
  return {
    ...baseEnv,
    PATH: `${params.appBinDir}:${baseEnv.PATH}`,
  };
}
```

---

## Alternatives Considered

### Shell Wrapper Files (superset approach)

**How it works:** Create temporary `.zshrc`/`.bashrc` wrapper files that:

1. Source user's original config files
2. Prepend app's bin directory to PATH
3. Use shell hooks (precmd, etc.) to maintain PATH priority

**Pros:**

- Full control over shell initialization
- Can inject app binaries via wrapper scripts
- Works with shell hooks for dynamic PATH management
- Handles edge cases (tools that rebuild PATH)

**Cons:**

- More complex (create temp files, manage ZDOTDIR, handle multiple shells)
- Requires deep understanding of each shell's startup sequence
- Overkill if we just want correct environment
- More maintenance surface

**Decision:** Not chosen for MVP — simpler extraction approach is sufficient for our current needs. Can be added later if we need to inject app binaries.

### Environment Whitelist (superset approach)

**How it works:** Only pass specific environment variables from `process.env` to the PTY, blocking everything else.

**Pros:**

- Prevents app secrets (DATABASE_URL, API keys) from leaking to terminals
- Explicit control over what gets passed
- Security-first approach

**Cons:**

- Misses legitimate tools (new version managers, custom tools)
- Requires ongoing maintenance as tools evolve
- User's shell config is the ultimate filter anyway

**Decision:** Not needed for MVP — we're extracting from user's shell, which already represents the user's chosen environment. The shell config is the filter.

### No Caching

**How it works:** Extract environment on every terminal spawn.

**Pros:**

- Always fresh environment
- Simpler code (no cache management)

**Cons:**

- 100-500ms delay on every terminal spawn
- Wasteful (shell config rarely changes during session)
- Poor UX for opening multiple terminals

**Decision:** Cache with manual invalidation for MVP. Add auto-invalidation (file watching) in future.

### Synchronous Extraction

**How it works:** Use `spawnSync` to extract environment synchronously.

**Pros:**

- Simpler API (spawn can be synchronous)

**Cons:**

- Blocks main process during extraction
- Poor UX (app freezes for 100-500ms)

**Decision:** Async extraction with pre-warming on startup.

---

## Dependencies

No new npm dependencies required. Uses only Node.js built-in modules:

| Module          | Purpose                                |
| --------------- | -------------------------------------- |
| `child_process` | Spawn shell for environment extraction |
| `os`            | Homedir, platform detection            |

---

## Performance Impact

| Operation            | Before   | After      | Notes             |
| -------------------- | -------- | ---------- | ----------------- |
| App startup          | baseline | +100-500ms | One-time pre-warm |
| First terminal spawn | ~10ms    | ~10ms      | Uses cached env   |
| Subsequent spawns    | ~10ms    | ~10ms      | No change         |
| Memory               | baseline | +~50KB     | Per cached env    |
| Cache invalidation   | N/A      | <1ms       | Map.clear()       |

**User-perceived impact:** Negligible. The 100-500ms delay happens once during app startup, before user interacts with the app.

---

## Security Considerations

### Existing Behavior (No Change)

Extracted environment may contain sensitive data (API keys, tokens, session cookies). This is expected behavior — same as native terminal emulators.

### No Additional Risks

- We're reading from user's shell, which user already controls
- Not adding new attack vectors
- Not exposing additional data beyond what `process.env` already had

### Future Considerations

If we add custom environment injection (e.g., app binaries, API keys), we'll need to:

1. Document what we're injecting
2. Provide opt-out mechanism
3. Be careful not to leak Electron app secrets

---

## Migration Path

### Phase 1: Add Service (Non-Breaking)

1. Add `ShellEnvService` class
2. Keep `PtyManager.spawn()` using `process.env` for now
3. Add unit tests

### Phase 2: Integrate (Non-Breaking)

1. Modify `PtyManager` to accept `ShellEnvService` in constructor
2. Add pre-warm call in `TerminalPlugin.activate()`
3. Use cached environment in `spawn()`, fallback to `process.env`
4. Test with various shells and configurations

### Phase 3: Remove Old Path

1. Once confident, remove `process.env` fallback
2. Keep fallback for error cases (timeout, shell failure)

### Rollback Plan

If issues arise:

1. Revert `PtyManager` to use `process.env` directly
2. Disable `ShellEnvService` (no-op)
3. No breaking changes to API

---

## Success Criteria

- [ ] Terminal has same PATH as native terminal (Terminal.app, iTerm2)
- [ ] Version manager tools (nvm, fnm, mise) work correctly
- [ ] App startup delay < 500ms
- [ ] Terminal spawn delay < 50ms (after cache)
- [ ] Graceful fallback on shell errors

---

## Open Questions

1. **Should we make `spawn()` async?**
   - Pro: Cleaner API, no pre-warming needed
   - Con: Breaking change to existing contract
   - Decision: Keep synchronous for now, use pre-warming

2. **Should we inject app binaries into PATH?**
   - Useful for bundled tools (bun, custom CLI)
   - Adds complexity
   - Decision: Not for MVP, evaluate later

3. **Cache invalidation trigger?**
   - Manual (user action via command)
   - Time-based (TTL)
   - Decision: Manual for MVP
