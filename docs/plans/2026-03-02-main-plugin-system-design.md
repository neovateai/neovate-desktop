# Main Process Plugin System Design

## Goal

Create a plugin system for the Electron main process that:
- Allows plugins to register oRPC routers (typed RPC procedures)
- Gives plugins full Node.js/Electron API access (same process)
- Uses identical API for first-party and third-party plugins
- Mirrors the renderer plugin system pattern (enforce ordering, configContributions, activate/deactivate)

## Non-Goals

- Renderer-side plugin UI (separate design, separate worktree)
- Plugin sandboxing/isolation (same process, trust model)
- Hot reload (plugins loaded at startup, requires restart)
- Inter-plugin communication (can be added later)

## Plugin Definition

A plugin is an object implementing `MainPlugin`:

```typescript
export interface MainPlugin extends Partial<MainPluginHooks> {
  name: string;
  enforce?: "pre" | "post";
}

export interface MainPluginHooks {
  /** Declare what this plugin contributes (router, etc.) — run in parallel */
  configContributions: (ctx: PluginContext) => MainPluginContributions | Promise<MainPluginContributions>;
  /** Side-effect setup — run in series, respects enforce order */
  activate: (ctx: PluginContext) => void | Promise<void>;
  /** Cleanup — run in series */
  deactivate: () => void | Promise<void>;
}

export interface MainPluginContributions {
  router?: Router<any, any>;
}

export interface PluginContext {
  appContext: AppContext;
}
```

### Example: ACP Plugin (first-party)

```typescript
// src/main/plugins/acp/index.ts
import type { MainPlugin } from "../../core/types";

let connectionManager: AcpConnectionManager;

export default {
  name: "acp",
  configContributions: ({ appContext }) => ({
    router: createAcpRouter(appContext.acpConnectionManager),
  }),
  activate: ({ appContext }) => {
    connectionManager = appContext.acpConnectionManager;
  },
  deactivate: () => {
    connectionManager.disconnectAll();
  },
} satisfies MainPlugin;
```

### Example: Third-party Plugin (future npm package)

```typescript
// @neovate/plugin-git/main/index.ts
import type { MainPlugin } from "@neovate/plugin-sdk";
import { z } from "zod";
import { os } from "@orpc/server";

export default {
  name: "git",
  configContributions: () => ({
    router: os.router({
      status: os.handler({
        input: z.object({ cwd: z.string() }),
        handler: async ({ input }) => {
          const { execSync } = await import("child_process");
          return execSync("git status --short", { cwd: input.cwd }).toString();
        },
      }),
    }),
  }),
} satisfies MainPlugin;
```

## Plugin Manager

Lives in `src/main/core/plugin-manager.ts`. Mirrors the renderer `PluginManager`.

```typescript
export class PluginManager {
  private readonly plugins: MainPlugin[];
  contributions: Required<MainPluginContributions> = EMPTY_CONTRIBUTIONS;

  constructor(rawPlugins: MainPlugin[] = []) {
    this.plugins = [
      ...rawPlugins.filter((p) => p.enforce === "pre"),
      ...rawPlugins.filter((p) => !p.enforce),
      ...rawPlugins.filter((p) => p.enforce === "post"),
    ];
  }

  getPlugins(): readonly MainPlugin[] {
    return this.plugins;
  }

  /** Collect and merge configContributions from all plugins (parallel) */
  async configContributions(ctx: PluginContext): Promise<void> {
    const results = await this.applyParallel("configContributions", ctx);
    this.contributions = mergeContributions(
      results.filter((r): r is MainPluginContributions => r != null),
    );
  }

  /** Run activate hooks (series, enforce order) */
  async activate(ctx: PluginContext): Promise<void> {
    await this.applySeries("activate", ctx);
  }

  /** Run deactivate hooks (series) */
  async deactivate(): Promise<void> {
    await this.applySeries("deactivate");
  }

  private async applySeries<K extends keyof MainPluginHooks>(
    hook: K,
    ...args: Parameters<MainPluginHooks[K]>
  ): Promise<void> {
    for (const plugin of this.plugins) {
      const fn = plugin[hook];
      if (typeof fn === "function") {
        await (fn as Function).call(plugin, ...args);
      }
    }
  }

  private async applyParallel<K extends keyof MainPluginHooks>(
    hook: K,
    ...args: Parameters<MainPluginHooks[K]>
  ): Promise<ReturnType<MainPluginHooks[K]>[]> {
    const promises = this.plugins
      .filter((plugin) => typeof plugin[hook] === "function")
      .map((plugin) => {
        const fn = plugin[hook] as Function;
        return fn.call(plugin, ...args);
      });
    return Promise.all(promises) as Promise<ReturnType<MainPluginHooks[K]>[]>;
  }
}
```

## Lifecycle

1. **Construct** `PluginManager` with all plugin objects (enforce ordering applied)
2. **`configContributions(ctx)`** — parallel — each plugin returns `{ router }` contributions
3. **Merge contributions** — routers merged by plugin name into root router
4. **Build `RPCHandler`** from merged router, start MessagePort listener
5. **`activate(ctx)`** — series (pre → normal → post) — side-effect setup
6. **On shutdown: `deactivate()`** — series — cleanup in reverse

## Router Merging

All plugin routers are merged into one root router keyed by plugin name:

```typescript
// src/main/core/router.ts
function buildRouter(contributions: Required<MainPluginContributions>) {
  // Result: { ping: handler, acp: { connect, newSession, ... }, git: { status } }
  return {
    ping: os.handler(() => "pong" as const),
    ...contributions.routers, // Map<pluginName, Router> spread into root
  };
}
```

The renderer client shape is unchanged — `client.acp.connect(...)` works the same.

## Type Safety

- **Within a plugin:** natural TypeScript — contract/router/types in the same package
- **Plugin renderer → own main:** import the plugin's contract from its package
- **Plugin → built-in APIs:** import `@neovate/desktop/contract` or app types
- **Renderer → plugin:** import plugin's contract for `ContractRouterClient` typing
- No codegen required — just package imports

## File Structure

```
src/main/
├── core/
│   ├── types.ts              # MainPlugin, MainPluginHooks, MainPluginContributions, PluginContext
│   ├── plugin-manager.ts     # PluginManager class
│   └── router.ts             # buildRouter from merged contributions
├── plugins/
│   └── acp/
│       ├── index.ts           # MainPlugin definition (activate/deactivate/configContributions)
│       ├── router.ts          # oRPC router (moved from features/acp/router.ts)
│       ├── connection-manager.ts
│       └── connection.ts
├── index.ts                   # App entry: create PluginManager, lifecycle, RPCHandler
└── (features/ removed — migrated to plugins/)
```

## Migration Path

1. Create `src/main/core/` with types and PluginManager
2. Move `src/main/features/acp/` → `src/main/plugins/acp/`
3. Create `src/main/plugins/acp/index.ts` as a `MainPlugin`
4. Update `src/main/index.ts` to use PluginManager lifecycle
5. Update `src/main/router.ts` to build from contributions
6. Shared contract in `src/shared/` stays unchanged
7. Renderer code unchanged

## Future Extensions

- **Third-party loading:** scan `~/.neovate/plugins/` and `node_modules/@neovate/plugin-*`
- **`ctx.registerRouter()`:** imperative router registration in `activate()` for dynamic cases
- **Settings API:** `ctx.settings.get(pluginName)` for plugin configuration
- **Event bus:** `ctx.events.on/emit` for inter-plugin communication
- **Renderer plugin pairing:** plugin package exports both `main/` and `renderer/` entry points
