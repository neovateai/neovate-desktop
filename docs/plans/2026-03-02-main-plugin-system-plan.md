# Main Plugin System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a plugin system for the Electron main process so that features (like ACP) are loaded as plugins with a unified activate/deactivate lifecycle and oRPC router contributions.

**Architecture:** Plugins are objects with `name`, `configContributions(ctx)`, `activate(ctx)`, and `deactivate()` hooks. A `PluginManager` (mirroring the renderer pattern) collects router contributions in parallel, merges them into the root oRPC router, then activates plugins in enforce order. Plugin routers use closure-based context — they capture their dependencies via closures in `configContributions`, not via oRPC's `$context`. This makes plugins self-contained and independent of a shared context type.

**Tech Stack:** TypeScript, oRPC, Electron, Vitest

**Worktree:** `/Users/dinq/.vibest/worktrees/neovateai/neovate-desktop/feat-main-plugin-system`

---

### Task 1: Create core plugin types

**Files:**
- Create: `packages/desktop/src/main/core/types.ts`

**Step 1: Write the type definitions**

```typescript
// packages/desktop/src/main/core/types.ts
import type { Router } from "@orpc/server";

export interface MainPluginContributions {
  router?: Router<any, any>;
}

export interface PluginContext {
  appContext: AppContext;
}

export interface MainPluginHooks {
  configContributions: (ctx: PluginContext) => MainPluginContributions | Promise<MainPluginContributions>;
  activate: (ctx: PluginContext) => void | Promise<void>;
  deactivate: () => void | Promise<void>;
}

export interface MainPlugin extends Partial<MainPluginHooks> {
  name: string;
  enforce?: "pre" | "post";
}

export type AppContext = {
  acpConnectionManager: import("../features/acp/connection-manager").AcpConnectionManager;
};
```

Note: `AppContext` moves here from `packages/desktop/src/main/router.ts:6-8`. The old `router.ts` will import from here instead.

**Step 2: Verify types compile**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors (may need to adjust import paths)

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/types.ts
git commit -m "feat: add main plugin system core types"
```

---

### Task 2: Create PluginManager

**Files:**
- Create: `packages/desktop/src/main/core/plugin-manager.ts`
- Test: `packages/desktop/src/main/core/__tests__/plugin-manager.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/core/__tests__/plugin-manager.test.ts
import { describe, it, expect, vi } from "vitest";
import { PluginManager } from "../plugin-manager";
import type { MainPlugin, PluginContext } from "../types";

function makeCtx(): PluginContext {
  return { appContext: { acpConnectionManager: {} } } as any;
}

describe("PluginManager", () => {
  describe("enforce ordering", () => {
    it("sorts plugins: pre → normal → post", () => {
      const pre: MainPlugin = { name: "pre", enforce: "pre" };
      const normal: MainPlugin = { name: "normal" };
      const post: MainPlugin = { name: "post", enforce: "post" };

      const manager = new PluginManager([post, normal, pre]);
      const names = manager.getPlugins().map((p) => p.name);

      expect(names).toEqual(["pre", "normal", "post"]);
    });
  });

  describe("configContributions", () => {
    it("collects router contributions from all plugins", async () => {
      const fakeRouter = { handler: "fake" };
      const plugin: MainPlugin = {
        name: "test",
        configContributions: () => ({ router: fakeRouter as any }),
      };

      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.get("test")).toBe(fakeRouter);
    });

    it("skips plugins without configContributions", async () => {
      const plugin: MainPlugin = { name: "empty" };
      const manager = new PluginManager([plugin]);
      await manager.configContributions(makeCtx());

      expect(manager.contributions.routers.size).toBe(0);
    });

    it("passes PluginContext to configContributions", async () => {
      const spy = vi.fn().mockReturnValue({});
      const plugin: MainPlugin = { name: "test", configContributions: spy };
      const ctx = makeCtx();

      const manager = new PluginManager([plugin]);
      await manager.configContributions(ctx);

      expect(spy).toHaveBeenCalledWith(ctx);
    });
  });

  describe("activate", () => {
    it("calls activate in enforce order", async () => {
      const order: string[] = [];
      const mkPlugin = (name: string, enforce?: "pre" | "post"): MainPlugin => ({
        name,
        enforce,
        activate: () => { order.push(name); },
      });

      const manager = new PluginManager([
        mkPlugin("post", "post"),
        mkPlugin("normal"),
        mkPlugin("pre", "pre"),
      ]);
      await manager.activate(makeCtx());

      expect(order).toEqual(["pre", "normal", "post"]);
    });
  });

  describe("deactivate", () => {
    it("calls deactivate on all plugins", async () => {
      const spy = vi.fn();
      const plugin: MainPlugin = { name: "test", deactivate: spy };

      const manager = new PluginManager([plugin]);
      await manager.deactivate();

      expect(spy).toHaveBeenCalled();
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/plugin-manager.test.ts`
Expected: FAIL — cannot resolve `../plugin-manager`

**Step 3: Write PluginManager implementation**

```typescript
// packages/desktop/src/main/core/plugin-manager.ts
import type { MainPlugin, MainPluginContributions, PluginContext } from "./types";
import type { Router } from "@orpc/server";

export type MergedContributions = {
  routers: Map<string, Router<any, any>>;
};

const EMPTY_CONTRIBUTIONS: MergedContributions = {
  routers: new Map(),
};

function mergeContributions(
  plugins: MainPlugin[],
  results: (MainPluginContributions | null | undefined)[],
): MergedContributions {
  const routers = new Map<string, Router<any, any>>();
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result?.router) {
      routers.set(plugins[i]!.name, result.router);
    }
  }
  return { routers };
}

export class PluginManager {
  private readonly plugins: MainPlugin[];
  contributions: MergedContributions = EMPTY_CONTRIBUTIONS;

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

  async configContributions(ctx: PluginContext): Promise<void> {
    const pluginsWithHook = this.plugins.filter(
      (p) => typeof p.configContributions === "function",
    );
    const results = await Promise.all(
      pluginsWithHook.map((p) => p.configContributions!(ctx)),
    );
    this.contributions = mergeContributions(pluginsWithHook, results);
  }

  async activate(ctx: PluginContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (typeof plugin.activate === "function") {
        await plugin.activate(ctx);
      }
    }
  }

  async deactivate(): Promise<void> {
    for (const plugin of this.plugins) {
      if (typeof plugin.deactivate === "function") {
        await plugin.deactivate();
      }
    }
  }
}
```

**Step 4: Run test to verify it passes**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/plugin-manager.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/core/plugin-manager.ts packages/desktop/src/main/core/__tests__/plugin-manager.test.ts
git commit -m "feat: add PluginManager with enforce ordering and lifecycle hooks"
```

---

### Task 3: Create router builder from plugin contributions

**Files:**
- Create: `packages/desktop/src/main/core/router.ts`
- Test: `packages/desktop/src/main/core/__tests__/router.test.ts`

**Step 1: Write the failing test**

```typescript
// packages/desktop/src/main/core/__tests__/router.test.ts
import { describe, it, expect } from "vitest";
import { call } from "@orpc/server";
import { buildRouter } from "../router";

describe("buildRouter", () => {
  it("includes ping handler", async () => {
    const router = buildRouter(new Map());
    const result = await call(router.ping, undefined, { context: {} });
    expect(result).toBe("pong");
  });

  it("includes plugin routers under their name", () => {
    const fakeRouter = { someHandler: "fake" };
    const routers = new Map([["myPlugin", fakeRouter as any]]);
    const router = buildRouter(routers);
    expect(router.myPlugin).toBe(fakeRouter);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/router.test.ts`
Expected: FAIL — cannot resolve `../router`

**Step 3: Write the router builder**

```typescript
// packages/desktop/src/main/core/router.ts
import { os } from "@orpc/server";
import type { Router } from "@orpc/server";

export function buildRouter(pluginRouters: Map<string, Router<any, any>>) {
  return {
    ping: os.handler(() => "pong" as const),
    ...Object.fromEntries(pluginRouters),
  };
}
```

Note: This replaces the old `packages/desktop/src/main/router.ts` which statically wired `ping` + `acp`. The contract in `src/shared/contract.ts` is unchanged — it still defines the shape for the renderer client.

**Step 4: Run test to verify it passes**

Run: `cd packages/desktop && bunx vitest run src/main/core/__tests__/router.test.ts`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/core/router.ts packages/desktop/src/main/core/__tests__/router.test.ts
git commit -m "feat: add buildRouter to merge plugin routers into root"
```

---

### Task 4: Refactor ACP router to closure-based context

**Files:**
- Modify: `packages/desktop/src/main/features/acp/router.ts`
- Modify: `packages/desktop/src/main/features/acp/__tests__/router.test.ts`

The current ACP router uses oRPC's `$context<AppContext>()` to access `context.acpConnectionManager` in handlers. We refactor it to a factory function `createAcpRouter(connectionManager)` where handlers close over their dependencies. This also flattens the router — removes the `os.acp.` nesting since the plugin system namespaces by plugin name.

**Step 1: Refactor router.ts to factory function with closures**

Replace `packages/desktop/src/main/features/acp/router.ts`:

```typescript
// packages/desktop/src/main/features/acp/router.ts
import { ORPCError } from "@orpc/server";
import { os } from "@orpc/server";
import { AgentSpawnError, listBuiltInAgents, formatErrorMessage } from "acpx";
import type { AcpConnectionManager } from "./connection-manager";
import { AGENT_OVERRIDES } from "./connection-manager";

const ACP_DEBUG = process.env.ACP_DEBUG === "1";

function acpLog(message: string, details?: Record<string, unknown>): void {
  if (!ACP_DEBUG) return;
  if (details) {
    console.log(`[acp-router] ${message}`, details);
    return;
  }
  console.log(`[acp-router] ${message}`);
}

function buildPromptError(
  error: unknown,
  manager: AcpConnectionManager,
  connectionId: string,
): ORPCError<"BAD_GATEWAY", unknown> {
  const stderrTail = manager.getStderr(connectionId).slice(-20);
  const lifecycle = manager.getClient(connectionId)?.getAgentLifecycleSnapshot();
  const lastExit = lifecycle?.lastExit;
  const message = formatErrorMessage(error);
  return new ORPCError("BAD_GATEWAY", {
    defined: true,
    message,
    data: {
      source: "acp_agent" as const,
      message,
      stderrTail,
      ...(lastExit
        ? {
            exitCode: lastExit.exitCode,
            signal: lastExit.signal,
            unexpectedDuringPrompt: lastExit.unexpectedDuringPrompt,
          }
        : {}),
    },
    cause: error instanceof Error ? error : undefined,
  });
}

export function createAcpRouter(manager: AcpConnectionManager) {
  return os.router({
    listAgents: os.handler(() => {
      return listBuiltInAgents(AGENT_OVERRIDES).map((name) => ({ id: name, name }));
    }),

    connect: os.handler(async ({ input }) => {
      acpLog("connect: start", { agentId: input.agentId, cwd: input.cwd });

      try {
        const connection = await manager.connect(input.agentId, input.cwd);
        acpLog("connect: success", { connectionId: connection.id, agentId: input.agentId });
        return { connectionId: connection.id };
      } catch (error) {
        const message =
          error instanceof AgentSpawnError || error instanceof Error
            ? `Failed to start agent "${input.agentId}": ${error.message}`
            : `Failed to start agent "${input.agentId}"`;
        acpLog("connect: failed", { agentId: input.agentId, error: message });
        throw new ORPCError("BAD_GATEWAY", { defined: true, message });
      }
    }),

    newSession: os.handler(async ({ input }) => {
      acpLog("newSession: start", { connectionId: input.connectionId, cwd: input.cwd });
      const conn = manager.getOrThrow(input.connectionId);

      const result = await conn.client.createSession(input.cwd ?? process.cwd());

      acpLog("newSession: success", {
        connectionId: input.connectionId,
        sessionId: result.sessionId,
      });
      return { sessionId: result.sessionId };
    }),

    prompt: os.handler(async function* ({ input, signal }) {
      acpLog("prompt: start", {
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        promptLength: input.prompt.length,
      });
      const conn = manager.getOrThrow(input.connectionId);

      const done = new AbortController();
      if (signal) {
        signal.addEventListener("abort", () => done.abort(signal.reason), { once: true });
      }

      let stopReason: string | undefined;
      let promptError: unknown;
      let eventCount = 0;

      const promptPromise = conn.client
        .prompt(input.sessionId, input.prompt)
        .then((result) => {
          stopReason = result.stopReason;
          acpLog("prompt: resolved", {
            connectionId: input.connectionId,
            sessionId: input.sessionId,
            stopReason: result.stopReason,
          });
          done.abort("prompt_done");
        })
        .catch((error: unknown) => {
          promptError = buildPromptError(error, manager, input.connectionId);
          acpLog("prompt: rejected", {
            connectionId: input.connectionId,
            sessionId: input.sessionId,
            error: formatErrorMessage(error),
          });
          done.abort("prompt_error");
        });

      const subscription = conn.subscribeSession(done.signal);

      try {
        for await (const event of subscription) {
          eventCount += 1;
          if (eventCount <= 10) {
            acpLog("prompt: event", {
              connectionId: input.connectionId,
              sessionId: input.sessionId,
              eventType: event.type,
              eventCount,
            });
          }
          yield event;
        }
      } catch (e: unknown) {
        if (!done.signal.aborted) {
          throw e;
        }
      } finally {
        subscription.return(undefined);
      }

      await promptPromise;
      if (promptError) throw promptError;

      acpLog("prompt: done", {
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        eventCount,
        stopReason: stopReason ?? "end_turn",
      });
      return { stopReason: stopReason ?? "end_turn" };
    }),

    resolvePermission: os.handler(({ input }) => {
      const conn = manager.getOrThrow(input.connectionId);
      conn.resolvePermission(input.requestId, input.optionId);
    }),

    cancel: os.handler(async ({ input }) => {
      const conn = manager.getOrThrow(input.connectionId);
      try {
        await conn.client.cancel(input.sessionId);
      } catch (error) {
        acpLog("cancel: failed", {
          connectionId: input.connectionId,
          sessionId: input.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),

    disconnect: os.handler(async ({ input }) => {
      try {
        await manager.disconnect(input.connectionId);
      } catch (error) {
        acpLog("disconnect: failed", {
          connectionId: input.connectionId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }),
  });
}
```

Key changes:
- `implement({ acp: acpContract }).$context<AppContext>()` → `os` (plain, no contract, no context type)
- `os.acp.X.handler(({ input, context }) => ...)` → `os.handler(({ input }) => ...)` — no more `context` param
- All `context.acpConnectionManager` → `manager` (from closure)
- Export `createAcpRouter` factory instead of `acpRouter` constant

**Step 2: Update tests to use factory function**

Replace `packages/desktop/src/main/features/acp/__tests__/router.test.ts`:

```typescript
// packages/desktop/src/main/features/acp/__tests__/router.test.ts
import { call } from "@orpc/server";
import { ORPCError } from "@orpc/server";
import { describe, it, expect, vi } from "vitest";
import { createAcpRouter } from "../router";
import { AcpConnection } from "../connection";
import type { AcpConnectionManager } from "../connection-manager";

function makeManager(overrides?: Partial<AcpConnectionManager>): AcpConnectionManager {
  return {
    connect: vi.fn(),
    get: vi.fn(),
    getOrThrow: vi.fn().mockImplementation((id: string) => {
      throw new ORPCError("NOT_FOUND", { defined: true, message: `Unknown connection: ${id}` });
    }),
    getClient: vi.fn(),
    getStderr: vi.fn().mockReturnValue([]),
    disconnect: vi.fn(),
    disconnectAll: vi.fn(),
    ...overrides,
  } as any;
}

describe("createAcpRouter", () => {
  describe("listAgents", () => {
    it("returns built-in agents", async () => {
      const manager = makeManager();
      const router = createAcpRouter(manager);
      const agents = await call(router.listAgents, undefined);

      expect(agents).toBeInstanceOf(Array);
      expect(agents.length).toBeGreaterThan(0);
      for (const agent of agents) {
        expect(agent).toHaveProperty("id");
        expect(agent).toHaveProperty("name");
      }
    });
  });

  describe("connect", () => {
    it("returns connectionId on success", async () => {
      const fakeConn = new AcpConnection("acp-42");
      const manager = makeManager({
        connect: vi.fn().mockResolvedValue(fakeConn),
      });
      const router = createAcpRouter(manager);

      const result = await call(router.connect, { agentId: "test-agent" });

      expect(result).toEqual({ connectionId: "acp-42" });
    });

    it("throws BAD_GATEWAY on AgentSpawnError", async () => {
      const manager = makeManager({
        connect: vi.fn().mockRejectedValue(new Error("ENOENT")),
      });
      const router = createAcpRouter(manager);

      await expect(call(router.connect, { agentId: "bad-agent" })).rejects.toThrow(
        ORPCError,
      );
    });
  });

  describe("newSession", () => {
    it("creates session on valid connection", async () => {
      const fakeConn = new AcpConnection("acp-1");
      fakeConn.setClient({
        createSession: vi.fn().mockResolvedValue({ sessionId: "s-123" }),
      } as any);

      const manager = makeManager({
        getOrThrow: vi.fn().mockReturnValue(fakeConn),
      });
      const router = createAcpRouter(manager);

      const result = await call(router.newSession, { connectionId: "acp-1" });

      expect(result).toEqual({ sessionId: "s-123" });
    });

    it("throws NOT_FOUND for unknown connection", async () => {
      const manager = makeManager();
      const router = createAcpRouter(manager);

      await expect(
        call(router.newSession, { connectionId: "unknown" }),
      ).rejects.toThrow(ORPCError);
    });
  });

  describe("resolvePermission", () => {
    it("calls resolvePermission on connection", async () => {
      const fakeConn = new AcpConnection("acp-1");
      vi.spyOn(fakeConn, "resolvePermission");

      const manager = makeManager({
        getOrThrow: vi.fn().mockReturnValue(fakeConn),
      });
      const router = createAcpRouter(manager);

      await call(
        router.resolvePermission,
        { connectionId: "acp-1", requestId: "r1", optionId: "allow" },
      );

      expect(fakeConn.resolvePermission).toHaveBeenCalledWith("r1", "allow");
    });

    it("throws NOT_FOUND for unknown connection", async () => {
      const manager = makeManager();
      const router = createAcpRouter(manager);

      await expect(
        call(
          router.resolvePermission,
          { connectionId: "unknown", requestId: "r1", optionId: "allow" },
        ),
      ).rejects.toThrow(ORPCError);
    });
  });

  describe("cancel", () => {
    it("cancels session on valid connection", async () => {
      const fakeConn = new AcpConnection("acp-1");
      fakeConn.setClient({
        cancel: vi.fn().mockResolvedValue(undefined),
      } as any);

      const manager = makeManager({
        getOrThrow: vi.fn().mockReturnValue(fakeConn),
      });
      const router = createAcpRouter(manager);

      await call(router.cancel, { connectionId: "acp-1", sessionId: "s1" });

      expect(fakeConn.client.cancel).toHaveBeenCalledWith("s1");
    });

    it("throws NOT_FOUND for unknown connection", async () => {
      const manager = makeManager();
      const router = createAcpRouter(manager);

      await expect(
        call(router.cancel, { connectionId: "unknown", sessionId: "s1" }),
      ).rejects.toThrow(ORPCError);
    });
  });

  describe("disconnect", () => {
    it("calls disconnect on manager", async () => {
      const manager = makeManager({
        disconnect: vi.fn().mockResolvedValue(undefined),
      });
      const router = createAcpRouter(manager);

      await call(router.disconnect, { connectionId: "acp-1" });

      expect(manager.disconnect).toHaveBeenCalledWith("acp-1");
    });
  });
});
```

Key changes to tests:
- `acpRouter` → `createAcpRouter(manager)` — creates router with mocked manager
- `makeContext()` → `makeManager()` — mock the manager directly, no oRPC context wrapper
- `call(router.X, input, { context })` → `call(router.X, input)` — no context needed

**Step 3: Run tests**

Run: `cd packages/desktop && bunx vitest run src/main/features/acp/__tests__/router.test.ts`
Expected: all PASS

**Step 4: Update the barrel export**

In `packages/desktop/src/main/features/acp/index.ts`, replace:
```typescript
export { acpRouter } from "./router";
```
With:
```typescript
export { createAcpRouter } from "./router";
```

**Step 5: Commit**

```bash
git add packages/desktop/src/main/features/acp/router.ts packages/desktop/src/main/features/acp/__tests__/router.test.ts packages/desktop/src/main/features/acp/index.ts
git commit -m "refactor: ACP router to closure-based context with factory function"
```

---

### Task 5: Create ACP plugin definition

**Files:**
- Create: `packages/desktop/src/main/plugins/acp/index.ts`

The plugin creates the `AcpConnectionManager` and passes it to `createAcpRouter` via closure. The plugin owns the full lifecycle of its dependencies.

**Step 1: Write the plugin definition**

```typescript
// packages/desktop/src/main/plugins/acp/index.ts
import type { MainPlugin } from "../../core/types";
import { AcpConnectionManager } from "../../features/acp/connection-manager";
import { createAcpRouter } from "../../features/acp/router";

let connectionManager: AcpConnectionManager;

export default {
  name: "acp",
  configContributions: () => {
    connectionManager = new AcpConnectionManager();
    return {
      router: createAcpRouter(connectionManager),
    };
  },
  deactivate: async () => {
    await connectionManager.disconnectAll();
  },
} satisfies MainPlugin;
```

Note: The `AcpConnectionManager` is now created and owned by the plugin, not by `index.ts`. This means `AppContext` no longer needs `acpConnectionManager` — we'll clean that up in Task 7.

**Step 2: Verify it compiles**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 3: Commit**

```bash
git add packages/desktop/src/main/plugins/acp/index.ts
git commit -m "feat: add ACP main plugin definition with closure-based router"
```

---

### Task 6: Wire PluginManager into main entry point

**Files:**
- Modify: `packages/desktop/src/main/index.ts`
- Modify: `packages/desktop/src/main/router.ts` (remove old static wiring, re-export AppContext from core)

**Step 1: Update router.ts to re-export from core**

Replace `packages/desktop/src/main/router.ts` with a thin re-export so existing imports (`import type { AppContext } from "../../router"`) keep working:

```typescript
// packages/desktop/src/main/router.ts
export type { AppContext } from "./core/types";
```

**Step 2: Update index.ts to use PluginManager**

Replace `packages/desktop/src/main/index.ts`:

```typescript
import { app, shell, BrowserWindow, ipcMain } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import icon from "../../resources/icon.png?asset";
import { RPCHandler } from "@orpc/server/message-port";
import { PluginManager } from "./core/plugin-manager";
import { buildRouter } from "./core/router";
import type { PluginContext } from "./core/types";
import acpPlugin from "./plugins/acp";

const ACP_DEBUG = process.env.ACP_DEBUG === "1";

if (is.dev && process.env.ELECTRON_CDP_PORT) {
  app.commandLine.appendSwitch("remote-debugging-port", process.env.ELECTRON_CDP_PORT);
}

const pluginManager = new PluginManager([acpPlugin]);
let handler: RPCHandler<any>;

async function initPlugins(): Promise<void> {
  const ctx: PluginContext = { appContext: {} as any };
  await pluginManager.configContributions(ctx);
  const router = buildRouter(pluginManager.contributions.routers);
  handler = new RPCHandler(router);
  await pluginManager.activate(ctx);
}

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    ...(process.platform === "linux" ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId("com.electron");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await initPlugins();

  ipcMain.on("start-orpc-server", (event) => {
    const [serverPort] = event.ports;
    if (ACP_DEBUG) {
      console.log("[orpc] start-orpc-server received, upgrading message port");
    }
    handler.upgrade(serverPort, { context: {} });
    serverPort.start();
  });

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  void pluginManager.deactivate();
});
```

Key changes:
- No more `AcpConnectionManager` or `appContext` in index.ts — the ACP plugin owns it
- `handler.upgrade(serverPort, { context: {} })` — context is empty, plugins use closures
- `app.on("before-quit")` calls `pluginManager.deactivate()` which triggers ACP cleanup
- `initPlugins()` is called inside `app.whenReady()` before creating windows

**Step 3: Run typecheck**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json`
Expected: no errors

**Step 4: Run all tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 5: Commit**

```bash
git add packages/desktop/src/main/index.ts packages/desktop/src/main/router.ts
git commit -m "feat: wire PluginManager into main entry point"
```

---

### Task 7: Clean up AppContext

**Files:**
- Modify: `packages/desktop/src/main/core/types.ts`

Since plugins now own their own state via closures, `AppContext` can be simplified. For now it becomes an empty extensible type — plugins don't need it for router context, but `PluginContext` still wraps it for any future shared state.

**Step 1: Simplify AppContext**

In `packages/desktop/src/main/core/types.ts`, replace:
```typescript
export type AppContext = {
  acpConnectionManager: import("../features/acp/connection-manager").AcpConnectionManager;
};
```
With:
```typescript
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type AppContext = {};
```

**Step 2: Run typecheck and tests**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json && bunx vitest run`
Expected: no errors, all PASS

**Step 3: Commit**

```bash
git add packages/desktop/src/main/core/types.ts
git commit -m "refactor: simplify AppContext now that plugins own their state"
```

---

### Task 8: Verify shared contract compatibility

**Files:**
- Read (no changes expected): `packages/desktop/src/shared/contract.ts`
- Read (no changes expected): `packages/desktop/src/renderer/src/orpc.ts`

The shared contract `{ ping, acp: acpContract }` and the renderer client `ContractRouterClient<typeof contract>` should still work because the merged router shape matches: `{ ping: handler, acp: { listAgents, connect, ... } }`.

**Step 1: Run full typecheck (both node and web)**

Run: `cd packages/desktop && bunx tsgo --noEmit -p tsconfig.node.json && bunx tsgo --noEmit -p tsconfig.web.json`
Expected: no errors

**Step 2: Run all tests**

Run: `cd packages/desktop && bunx vitest run`
Expected: all PASS

**Step 3: Commit (only if any fixups were needed)**

```bash
git commit -m "fix: ensure contract compatibility with plugin router"
```

---

### Task 9: Create core/index.ts barrel export

**Files:**
- Create: `packages/desktop/src/main/core/index.ts`

**Step 1: Write barrel export**

```typescript
// packages/desktop/src/main/core/index.ts
export { PluginManager } from "./plugin-manager";
export { buildRouter } from "./router";
export type { MainPlugin, MainPluginHooks, MainPluginContributions, PluginContext, AppContext } from "./types";
```

**Step 2: Commit**

```bash
git add packages/desktop/src/main/core/index.ts
git commit -m "feat: add core barrel export for plugin SDK"
```
