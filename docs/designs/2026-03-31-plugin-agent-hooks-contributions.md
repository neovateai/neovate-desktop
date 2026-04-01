# Plugin Agent Hooks Contributions

**Date:** 2026-03-31
**Status:** Approved

## Problem

Currently the only SDK hook (RTK `PreToolUse`) is hardcoded in `SessionManager.initSession()`. Plugins have no way to contribute hooks to Claude Agent SDK sessions. As more hook-based features are needed, `SessionManager` becomes a dumping ground for unrelated hook logic.

## Solution

Extend `PluginContributions` so plugins can declaratively contribute Claude Agent SDK hooks via the existing `configContributions()` lifecycle method. Hooks are collected and merged by `PluginManager`, then read by `SessionManager` when creating sessions.

## Design Decisions

### 1. Extend `configContributions`, not a separate method

`configContributions` is the unified entry point for all plugin contributions (routers, and now agent hooks). Keeping them together follows the existing pattern — one method, one collection pipeline. If agent hooks need different context in the future, it's easy to split; merging back is harder.

### 2. `AgentContributions` keyed by agent type

The app may support multiple agent types in the future. Instead of `configClaudeCode()`, `configCodex()`, etc. (interface bloat), contributions are namespaced by agent type:

```typescript
interface AgentContributions {
  claudeCode?: ClaudeCodeContributions;
  // future: codex?: CodexContributions;
}
```

### 3. `ClaudeCodeContributions` wraps SDK `Options`

Hooks come from the SDK's `Options` type. Rather than inventing abstract types, reuse the SDK type directly. The `options` namespace signals "these are SDK Options fields" and is extensible:

```typescript
interface ClaudeCodeContributions {
  options?: Pick<Options, "hooks">;
  // future: Pick<Options, "hooks" | "settings" | ...>
}
```

### 4. Declarative over dynamic registration

Plugins declare hooks in `configContributions()` (called once at startup), not via runtime registration. This matches the existing pattern and keeps the plugin lifecycle predictable.

### 5. Lazy getter for SessionManager wiring

`SessionManager` is created independently of `MainApp` in `index.ts`. A lazy getter `() => AgentContributions` is passed in the constructor to avoid temporal coupling — no setter, no initialization ordering concern.

## API

### Plugin Types

```typescript
// src/main/core/plugin/types.ts

interface PluginContributions {
  router?: AnyRouter;
  agents?: AgentContributions;
}

interface MainPluginHooks {
  configContributions(ctx: PluginContext): PluginContributions | Promise<PluginContributions>;
  activate(ctx: PluginContext): void | Promise<void>;
  deactivate(): void | Promise<void>;
}
```

### Agent Contribution Types

```typescript
// src/main/features/agent/types.ts

import type { Options } from "@anthropic-ai/claude-agent-sdk";

interface AgentContributions {
  claudeCode?: ClaudeCodeContributions;
}

interface ClaudeCodeContributions {
  options?: Pick<Options, "hooks">;
}
```

### Plugin Usage

```typescript
// Example: plugin contributing a PreToolUse hook
const myPlugin: MainPlugin = {
  name: "my-plugin",
  configContributions(ctx) {
    return {
      agents: {
        claudeCode: {
          options: {
            hooks: {
              PreToolUse: [{ matcher: "Bash", hooks: [myHookCallback] }],
            },
          },
        },
      },
    };
  },
};
```

## Merge Strategy

`PluginManager.configContributions()` collects all plugins' contributions (respecting enforce order). For agent hooks:

1. Collect all `agents.claudeCode.options.hooks` from plugin contributions
2. For each `HookEvent`, concatenate all `HookCallbackMatcher[]` arrays
3. Store merged result in `contributions.agentContributions`
4. `SessionManager` reads merged hooks via lazy getter and combines with its own internal hooks (RTK)

```
Plugin A hooks: { PreToolUse: [matcherA1] }
Plugin B hooks: { PreToolUse: [matcherB1], Stop: [matcherB2] }
─────────────────────────────────────────────
Merged:         { PreToolUse: [matcherA1, matcherB1], Stop: [matcherB2] }
```

## Migration

The existing RTK hook in `SessionManager.initSession()` should be extracted into a plugin contribution in a follow-up PR. This validates the new API and removes hardcoded hook logic from `SessionManager`.

## Files Changed

| File                                         | Change                                                        |
| -------------------------------------------- | ------------------------------------------------------------- |
| `src/main/features/agent/types.ts`           | New: `AgentContributions`, `ClaudeCodeContributions`          |
| `src/main/core/plugin/types.ts`              | Add `agents?` to `PluginContributions`                        |
| `src/main/core/plugin/contributions.ts`      | Add `agentContributions` to `Contributions`                   |
| `src/main/core/plugin/plugin-manager.ts`     | Merge agent hooks in `configContributions()`                  |
| `src/main/features/agent/session-manager.ts` | Accept lazy getter, merge plugin hooks with existing RTK hook |
| `src/main/index.ts`                          | Pass lazy getter to `SessionManager` constructor              |
