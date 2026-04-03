# Claude Code Binary Path Setting

## Summary

Add a `claudeCodeBinPath` string field to `AppConfig`. When empty (default), use the bundled SDK. When set, auto-detect by extension: `.js` files run with bun, everything else is treated as a standalone binary. The setting lives in **Settings > General > Advanced**.

## Use Cases

1. Point to a standalone Claude Code CLI (e.g., `/usr/local/bin/claude`)
2. Override the SDK's `cli.js` path (e.g., a custom build)
3. Switch between multiple Claude Code versions for testing

## Config Layer (3 files)

### `src/shared/features/config/types.ts`

Add `claudeCodeBinPath: string` to `AppConfig`.

### `src/shared/features/config/contract.ts`

Add to the `set` union:

```ts
z.object({ key: z.literal("claudeCodeBinPath"), value: z.string() });
```

### `src/main/features/config/config-store.ts`

Add to `DEFAULT_APP_CONFIG`:

```ts
claudeCodeBinPath: "";
```

## Main Process (2 files)

### `src/main/features/agent/claude-code-utils.ts`

Add new type and function:

```ts
export type ClaudeCodeExecutableInfo = {
  /** The runtime binary (bun path, or the standalone binary itself). */
  executable: string;
  /** The script path passed to the SDK (cli.js path, or undefined for standalone). */
  cliPath: string | undefined;
  /** Whether this is a standalone binary (not bun + cli.js). */
  standalone: boolean;
};

export function resolveClaudeCodeExecutable(customPath?: string): ClaudeCodeExecutableInfo {
  // Normalize: trim whitespace and expand ~ to homedir
  const normalized = customPath?.trim().replace(/^~(?=\/|$)/, homedir()) || undefined;

  if (!normalized) {
    return { executable: resolveBunPath(), cliPath: resolveSDKCliPath(), standalone: false };
  }
  if (normalized.endsWith(".js")) {
    return { executable: resolveBunPath(), cliPath: normalized, standalone: false };
  }
  // Standalone binary (e.g., /usr/local/bin/claude)
  // SDK spawns: spawn(executable, [cliPath, ...args])
  // For standalone, we use spawnClaudeCodeProcess to control spawning directly.
  return { executable: normalized, cliPath: undefined, standalone: true };
}
```

Input normalization (applied before auto-detect):

- Trim leading/trailing whitespace
- Expand `~` prefix to `os.homedir()` (e.g., `~/bin/claude` -> `/Users/foo/bin/claude`)

Auto-detect logic (on normalized path):

- Empty/undefined -> bundled SDK cli.js + bun (current behavior)
- Ends in `.js` -> bun + custom cli.js path
- Otherwise -> standalone binary (e.g., `/usr/local/bin/claude`)

### `src/main/features/agent/session-manager.ts`

In `queryOptions()`:

- Read `this.configStore.get("claudeCodeBinPath")`
- Call `resolveClaudeCodeExecutable(configuredPath)`
- For non-standalone (`.js` or default): pass `executable` and `pathToClaudeCodeExecutable` as before
- For standalone: use `spawnClaudeCodeProcess` override to spawn the binary directly, since the SDK's default spawning does `spawn(executable, [cliPath, ...args])` which would break for standalone binaries

```ts
const resolved = resolveClaudeCodeExecutable(
  this.configStore.get("claudeCodeBinPath") || undefined,
);

const options: Options = {
  ...queryOpts,
  pathToClaudeCodeExecutable: resolved.cliPath ?? resolved.executable,
  executable: resolved.standalone ? undefined : resolved.executable,
  ...(resolved.standalone
    ? {
        spawnClaudeCodeProcess: (spawnOpts) =>
          spawn(resolved.executable, spawnOpts.args, {
            cwd: spawnOpts.cwd,
            env: spawnOpts.env,
            signal: spawnOpts.signal,
            stdio: spawnOpts.stdio,
          }),
      }
    : {}),
};
```

In `initSession()`:

- When both `standalone` and `networkInspector` are enabled, skip the network inspector's `spawnClaudeCodeProcess` override (only one can be active). The standalone spawn takes priority.

**Network inspector incompatibility:** The network inspector injects bun's `--preload` flag, which standalone binaries don't support. When a custom non-`.js` binary is configured, the network inspector is silently disabled for that session.

## Renderer UI (1 file)

### `src/renderer/src/features/settings/components/panels/general-panel.tsx`

Add a new `SettingsRow` in the Advanced group (after `developerMode`):

- Title: "Claude Code Binary"
- Description: "Path to a Claude Code CLI binary or cli.js file. Leave empty to use the bundled version. Network Inspector is not supported with standalone binaries."
- Text input with debounced save (same pattern as `terminalFont`)
- A small "Browse" button next to the input that calls `client.electron.dialog.showOpenDialog()`:
  ```ts
  {
    properties: ["openFile", "showHiddenFiles"],
    filters: [{ name: "All Files", extensions: ["*"] }],
  }
  ```
  No restrictive filters — macOS binaries have no extension, Windows has `.exe`, and `.js` files are also valid.
- Placeholder text: `"Bundled (default)"`

### i18n Keys

Add to `src/renderer/src/locales/en-US.json`:

```json
"settings.general.claudeCodeBinPath": "Claude Code Binary",
"settings.general.claudeCodeBinPath.description": "Path to a Claude Code CLI binary or cli.js file. Leave empty to use the bundled version. Network Inspector is not supported with standalone binaries.",
"settings.general.claudeCodeBinPath.browse": "Browse"
```

Add to `src/renderer/src/locales/zh-CN.json`:

```json
"settings.general.claudeCodeBinPath": "Claude Code 可执行文件",
"settings.general.claudeCodeBinPath.description": "Claude Code CLI 可执行文件或 cli.js 的路径。留空使用内置版本。独立可执行文件不支持网络检查器。",
"settings.general.claudeCodeBinPath.browse": "浏览"
```

## Data Flow

```
User types/browses path
  -> debounce 500ms
  -> setConfig("claudeCodeBinPath", path)
  -> electron-store persists to ~/.neovate-desktop/config.json
  -> next session creation reads configStore.get("claudeCodeBinPath")
  -> resolveClaudeCodeExecutable() returns { executable, cliPath }
  -> SDK query() uses the resolved values
```

Changing this setting only affects **new sessions**. Active sessions keep their original binary.

## Compatibility Notes

- **Network Inspector:** Not supported with standalone binaries. The inspector injects bun's `--preload` flag which standalone CLIs don't understand. When a standalone binary is configured, the network inspector `spawnClaudeCodeProcess` override is skipped. The UI description warns users about this limitation.
- **RTK token optimization:** Works with both modes — it hooks at the SDK level via `HookCallback`, not at the spawn level.
- **Provider credentials:** Work with both modes — passed via `settings.env`, not spawn args.

## Testing

### `src/main/features/agent/__tests__/claude-code-utils.test.ts`

Unit test for `resolveClaudeCodeExecutable()` — three cases:

```ts
describe("resolveClaudeCodeExecutable", () => {
  it("returns bundled SDK defaults when no custom path", () => {
    const result = resolveClaudeCodeExecutable();
    expect(result.standalone).toBe(false);
    expect(result.cliPath).toContain("cli.js");
    expect(result.executable).toBeDefined();
  });

  it("uses bun + custom cliPath for .js paths", () => {
    const result = resolveClaudeCodeExecutable("/custom/path/cli.js");
    expect(result.standalone).toBe(false);
    expect(result.cliPath).toBe("/custom/path/cli.js");
  });

  it("returns standalone for non-.js paths", () => {
    const result = resolveClaudeCodeExecutable("/usr/local/bin/claude");
    expect(result.standalone).toBe(true);
    expect(result.executable).toBe("/usr/local/bin/claude");
    expect(result.cliPath).toBeUndefined();
  });

  it("expands ~ to homedir", () => {
    const result = resolveClaudeCodeExecutable("~/bin/claude");
    expect(result.standalone).toBe(true);
    expect(result.executable).toBe(path.join(os.homedir(), "bin/claude"));
  });

  it("trims whitespace", () => {
    const result = resolveClaudeCodeExecutable("  /usr/local/bin/claude  ");
    expect(result.executable).toBe("/usr/local/bin/claude");
  });

  it("treats whitespace-only as empty (bundled default)", () => {
    const result = resolveClaudeCodeExecutable("   ");
    expect(result.standalone).toBe(false);
    expect(result.cliPath).toContain("cli.js");
  });
});
```

Note: `resolveBunPath()` and `resolveSDKCliPath()` may need to be mocked since they depend on `is.dev` and `require.resolve`.

## Scope Exclusions

- No validation (file exists / is executable) -- user discovers bad paths at session creation
- No version display or detection
- No "reset to default" button (clearing the input achieves this)
- No restart prompt for active sessions
- No network inspector support for standalone binaries
