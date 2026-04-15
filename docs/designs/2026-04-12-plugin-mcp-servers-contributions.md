# Plugin MCP Servers Contributions

**Date:** 2026-04-12
**Status:** Draft
**Prerequisite:** [Plugin Agent Hooks Contributions](2026-03-31-plugin-agent-hooks-contributions.md)

## Problem

Plugins can contribute hooks to Claude Agent SDK sessions via `ClaudeCodeContributions.options.hooks`, but cannot contribute MCP servers. The `mcpServers` field on SDK `Options` is never populated. Plugins that need to expose tools to Claude Code (e.g., a database explorer, a monitoring dashboard) have no way to register their MCP servers through the contribution system.

## Solution

Extend `ClaudeCodeContributions.options` to include `mcpServers`, following the same pattern established for hooks. Plugins declare MCP servers in `configContributions()`, contributions are merged by name, and `SessionManager` passes the merged record to the SDK `Options`.

## Design Decisions

### 1. Widen the `Pick<Options, ...>` — no new types

The hooks design already established `ClaudeCodeContributions.options` as a subset of SDK `Options`. Adding `mcpServers` is a one-line change:

```typescript
interface ClaudeCodeContributions {
  options?: Pick<Options, "hooks" | "mcpServers">;
}
```

No wrapper types, no abstraction layer. Plugin authors work directly with SDK types.

### 2. Merge strategy: first-win by server name, warn on conflict

`Options.mcpServers` is `Record<string, McpServerConfig>`. When multiple plugins contribute servers:

1. Iterate contributions in enforce order (pre → normal → post)
2. For each server name, the **first** plugin to register it wins
3. If a server name already exists, log a warning and skip: `"MCP server '%s' from plugin '%s' ignored — already registered by '%s'"`

Rationale:

- Consistent with plugin enforce ordering: `pre` plugins have higher priority, their registrations should not be overridden by later plugins
- Consistent with `PluginManager`'s strict stance on conflicts (duplicate plugin names throw)
- MCP server names are naturally namespaced (plugin authors use prefixes like `my-plugin:server`), so conflicts are unlikely in practice; a warning is sufficient

### 3. Only process-transport configs (`McpServerConfigForProcessTransport`)

The SDK defines two config union types:

- `McpServerConfig` — includes `McpSdkServerConfigWithInstance` (contains a live `McpServer` object, not serializable)
- `McpServerConfigForProcessTransport` — stdio, SSE, HTTP only (serializable, sent to CLI subprocess)

Plugin contributions should use `McpServerConfigForProcessTransport` because:

- Plugin configs are declared at startup and must survive serialization to the CLI process
- SDK server instances (`McpSdkServerConfigWithInstance`) require in-process lifecycle management that doesn't fit the declarative contribution model
- If a plugin needs an in-process MCP server, it should use `createSdkMcpServer()` directly and contribute via a different mechanism (out of scope)

However, we use `Pick<Options, "hooks" | "mcpServers">` which types `mcpServers` as `Record<string, McpServerConfig>` (the full union). This is acceptable because:

- TypeScript will enforce correct types at the plugin authoring site
- The SDK handles both serializable and non-serializable configs internally
- We don't need to restrict the type — the SDK is the authority

### 4. Single merge function, not separate per-field functions

Rather than `mergeAgentHooks()` + `mergeAgentMcpServers()`, introduce `mergeAgentContributions()` that returns the full merged `ClaudeCodeContributions.options`. This avoids proliferating merge functions as more fields are added.

```typescript
export function mergeAgentContributions(
  agents: Contribution<AgentContributions>[],
): Pick<Options, "hooks" | "mcpServers"> {
  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
  const mcpServers: Record<string, McpServerConfig> = {};
  const mcpServerSources: Record<string, string> = {}; // server name → plugin name

  for (const { plugin, value } of agents) {
    // Merge hooks (concat)
    const pluginHooks = value.claudeCode?.options?.hooks;
    if (pluginHooks) {
      for (const [event, matchers] of Object.entries(pluginHooks)) {
        if (!matchers) continue;
        (hooks[event as HookEvent] ??= []).push(...matchers);
      }
    }

    // Merge mcpServers (first-win with warning)
    const pluginMcpServers = value.claudeCode?.options?.mcpServers;
    if (pluginMcpServers) {
      for (const [name, config] of Object.entries(pluginMcpServers)) {
        if (mcpServerSources[name]) {
          log(
            "MCP server '%s' from plugin '%s' ignored — already registered by '%s'",
            name,
            plugin.name,
            mcpServerSources[name],
          );
          continue;
        }
        mcpServers[name] = config;
        mcpServerSources[name] = plugin.name;
      }
    }
  }

  return {
    ...(Object.keys(hooks).length > 0 ? { hooks } : {}),
    ...(Object.keys(mcpServers).length > 0 ? { mcpServers } : {}),
  };
}
```

### 5. `mergeAgentHooks` becomes a thin wrapper (backwards compat)

The existing `mergeAgentHooks()` is called in session-manager and tests. Rather than updating all call sites in this PR, keep it as a wrapper that delegates to `mergeAgentContributions()`. It can be removed in a follow-up.

Alternatively, replace all usages directly. The call sites are few (session-manager + 1 test file), so either approach is low-risk.

## API

### Plugin Usage

```typescript
const myPlugin: MainPlugin = {
  name: "db-explorer",
  configContributions() {
    return {
      agents: {
        claudeCode: {
          options: {
            mcpServers: {
              "db-explorer:postgres": {
                command: "node",
                args: ["./mcp-server.js"],
                env: { DATABASE_URL: "..." },
              },
            },
          },
        },
      },
    };
  },
};
```

### SessionManager Integration

```typescript
// session-manager.ts — initSession()
const merged = mergeAgentContributions(this.getAgentContributions());

// Add built-in RTK hook
if (registerRtkHook) {
  (merged.hooks ??= {} as any).PreToolUse ??= [];
  (merged.hooks!.PreToolUse as HookCallbackMatcher[]).push({ matcher: "Bash", hooks: [rtkHook] });
}

const options: Options = {
  ...queryOpts,
  allowDangerouslySkipPermissions: true,
  env,
  settings: { ... },
  hooks: merged.hooks ?? {},
  mcpServers: merged.mcpServers,
  ...(opts?.resume ? { resume: opts.resume, sessionId: undefined } : {}),
  ...(spawnOverride ? { spawnClaudeCodeProcess: spawnOverride } : {}),
};
```

## Merge Strategy Summary

| Field        | Strategy      | Conflict Behavior                    |
| ------------ | ------------- | ------------------------------------ |
| `hooks`      | Concat arrays | All hooks execute (no conflict)      |
| `mcpServers` | First-win     | Warning logged, later plugin skipped |

## Files Changed

| File                                         | Change                                               |
| -------------------------------------------- | ---------------------------------------------------- |
| `src/main/core/plugin/contributions.ts`      | Widen `Pick<>`, add `mergeAgentContributions()`      |
| `src/main/features/agent/session-manager.ts` | Use `mergeAgentContributions()`, spread `mcpServers` |
| Tests                                        | Update to cover mcpServers merge + conflict warning  |
