# Plugin-Extensible Deeplink System

## Goal

Add a deeplink system (`neovate://` / `neovate-dev://`) where both the app and plugins register handlers using the same API. Any handler can run in the main process, the renderer, or both.

## URI Format

```
neovate://{handler-name}/{path}?{query}
```

- **Scheme**: `neovate://` for production builds, `neovate-dev://` for dev builds (determined by `BUILD_ENV` at build time)
- **Authority**: Handler name — used to route the deeplink. Can be a plugin name or an app-level name.
- **Path + Query**: Owned entirely by the handler

Examples:

- `neovate://open?path=/Users/me/project` — app-level: open a project
- `neovate://settings` — app-level: open settings
- `neovate://git/clone?url=https://github.com/foo/bar` — plugin: git clone
- `neovate://editor/open?file=/src/main.ts&line=42` — plugin: open file
- `neovate://terminal/session/abc123` — plugin: focus terminal session

## Scope

- **macOS only** — no `second-instance`, no `requestSingleInstanceLock`, no Windows/Linux support
- **No runtime protocol registration** — electron-builder `mac.protocols` handles OS registration at install time. Local `bun dev` does not support deeplinks.

## Decisions

### Protocol Registration

**electron-builder only.** Register the scheme in `configs/electron-builder.mjs` via `mac.protocols`.

```javascript
mac: {
  protocols: [
    {
      name: isDev ? "Neovate Dev" : "Neovate",
      schemes: [isDev ? "neovate-dev" : "neovate"],
    },
  ];
}
```

The scheme is a build-time constant derived from the existing `isDev` flag (`BUILD_ENV === "dev"`). This distinguishes dev builds (Neovate Dev app) from production builds — both are installed apps.

### Unified Handler Registration

Following VS Code's pattern, there is **no distinction between app-level and plugin-level handlers**. Both use the same `DeeplinkHandler` interface.

- **App handlers** are registered in `index.ts` via `mainApp.deeplink.register()` before `mainApp.start()` — first-registered wins
- **Plugin handlers** are registered via `configContributions()` returning `deeplinkHandler` — collected by `PluginManager`, registered during `start()`
- **No reserved names, no auto-prefix** — plugin uses its own name. If a name collides, the first-registered handler wins (app always wins since it registers first).

### Dispatch Model

When a deeplink arrives:

1. **Main handler** runs first (if registered). It can return data.
2. **Always publish to renderer** — regardless of whether a main handler exists.
3. **Renderer handler** runs (if registered). It receives the main handler's return data via `event.data`.
4. **If neither side has a handler** → renderer shows toast notification.

The event carries an `unhandled: boolean` flag — `true` when no main handler was registered. Renderer uses this to decide whether to show a toast when it also has no handler.

### Handler Location

Handlers decide where their deeplink runs. Plugin does NOT need to declare both sides:

| Handler Type  | Main declares     | Renderer declares | What happens                                                                                      |
| ------------- | ----------------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| Main-only     | `deeplinkHandler` | —                 | Main handles, renderer gets event but no handler → silent (not unhandled because main handled it) |
| Renderer-only | —                 | `deeplinkHandler` | Main skips, event marked `unhandled: true`, renderer handles                                      |
| Both          | `deeplinkHandler` | `deeplinkHandler` | Main handles first, renderer handles with data                                                    |

### Multi-Window Routing

Always route to the main window. Multi-window targeting not supported in v1.

### Renderer UI Response

Renderer deeplink handlers trigger UI changes by calling Zustand store actions directly (`useXxxStore.getState().action()`). No separate event bus needed.

### URI Buffering & Cold Launch

Deeplinks can arrive before `mainApp.start()` completes. The `DeeplinkService` buffers URLs and replays them after `activate()`.

**Cold launch timing for renderer events**: `EventPublisher.publish()` drops events when no subscriber exists. To solve this, the oRPC subscribe handler uses a `subscribe → consumePending → yield real-time stream` pattern:

1. Router's subscribe handler first registers a listener on `EventPublisher` (from this point, new events are buffered in the iterator)
2. Then yields pending events from `DeeplinkService.consumePending()` (events published before any subscriber existed)
3. Then yields the real-time stream

This is race-safe because JS is single-threaded: between step 1 (register listener) and step 2 (consume pending), no async operation occurs, so no events can be lost.

## Architecture

### Ownership

`DeeplinkService` is owned by `MainApp` — same level as `windowManager` and `pluginManager`. Created in constructor, exposed as `readonly deeplink`.

`IMainApp` exposes `readonly deeplink: DeeplinkService`. Plugins register handlers declaratively via `configContributions()` returning `deeplinkHandler` — this is the primary API. The imperative `deeplink.register()` is used by app-level code in `index.ts`.

### Flow

```
OS deeplink
  → Electron `open-url` event (macOS)
    → mainApp.deeplink.handle(url)
      → if not ready: buffer URL
      → if ready: dispatch(url)
        → parse: { name, path, searchParams }
        → main handler exists? → execute, get data
        → publish to renderer: { name, path, searchParams, data, unhandled }
          → renderer subscribe handler:
            → first call: consumePending() + register real-time listener
            → handler exists? → call handler(event)
            → no handler + event.unhandled? → toast
```

### Main Process Types

```typescript
// src/main/core/deeplink/types.ts
export interface DeeplinkHandler {
  handle(ctx: DeeplinkContext): unknown | Promise<unknown>;
}

export interface DeeplinkContext {
  path: string;
  searchParams: URLSearchParams;
}
```

### Shared Event Type & Contract

```typescript
// src/shared/features/deeplink/contract.ts
export interface DeeplinkEvent {
  name: string;
  path: string;
  searchParams: Record<string, string>;
  data?: unknown;
  unhandled: boolean;
}

export const deeplinkContract = {
  subscribe: oc.output(eventIterator(type<DeeplinkEvent>())),
};
```

### Renderer Handler Type

```typescript
// src/renderer/src/core/deeplink/types.ts
export type DeeplinkHandler = (event: DeeplinkEvent) => void;
```

### Plugin Registration

Plugins declare `deeplinkHandler` in `configContributions()`:

```typescript
// Main plugin
export default {
  name: "git",
  configContributions: (ctx) => ({
    router: createGitRouter(ctx.orpcServer),
    deeplinkHandler: {
      handle(ctx) { /* ... */ }
    }
  }),
} satisfies MainPlugin;

// Renderer plugin
configContributions(ctx) {
  return {
    deeplinkHandler: (event) => { /* ... */ }
  };
}
```

### App-Level Registration

```typescript
// index.ts — before mainApp.start()
mainApp.deeplink.register("session", {
  handle(ctx) {
    const match = ctx.path.match(/^\/?(.+)/);
    if (!match) return null;
    const sessionId = match[1];
    const project = ctx.searchParams.get("project");
    if (!sessionId || !project) return null;
    return { sessionId, project: decodeURIComponent(project) };
  },
});
```

### DeeplinkService

```typescript
// src/main/core/deeplink/deeplink-service.ts
class DeeplinkService {
  readonly publisher = new EventPublisher<{ deeplink: DeeplinkEvent }>();
  private buffer: string[] = [];
  private handlers = new Map<string, DeeplinkHandler>();
  private pendingForRenderer: DeeplinkEvent[] = [];
  private ready = false;

  register(name: string, handler: DeeplinkHandler): void;
  handle(url: string): void;
  async activate(): Promise<void>; // flush buffer, dispatch sequentially
  consumePending(): DeeplinkEvent[]; // take and clear pending renderer events
}
```

### Subscribe Handler (Cold Start Safe)

```typescript
// src/main/features/deeplink/router.ts
subscribe: handler(async function* ({ context, signal }) {
  const service = context.mainApp.deeplink;

  // 1. Register listener FIRST (new events buffered in iterator from here)
  const iterator = service.publisher.subscribe("deeplink", { signal });

  // 2. Yield pending events (published before any subscriber existed)
  for (const event of service.consumePending()) {
    yield event;
  }

  // 3. Yield real-time stream (seamless, no gap)
  for await (const event of iterator) {
    yield event;
  }
});
```

### Changes Summary

| Layer               | File                                             | Change                                                                                                      |
| ------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Build config        | `configs/electron-builder.mjs`                   | Add `protocols` to `mac`                                                                                    |
| Shared contract     | `src/shared/features/deeplink/contract.ts`       | **New** — `DeeplinkEvent`, `deeplinkContract`                                                               |
| Deeplink types      | `src/main/core/deeplink/types.ts`                | **New** — `DeeplinkHandler`, `DeeplinkContext`                                                              |
| Deeplink service    | `src/main/core/deeplink/deeplink-service.ts`     | **New** — parse, buffer, register, dispatch, `EventPublisher`                                               |
| Deeplink router     | `src/main/features/deeplink/router.ts`           | **New** — `subscribe` with cold-start-safe consume pattern                                                  |
| App orchestrator    | `src/main/app.ts`                                | Add `readonly deeplink: DeeplinkService`, register plugin handlers in `start()`                             |
| App entry           | `src/main/index.ts`                              | Wire `open-url` to `mainApp.deeplink.handle()`, register app-level handlers                                 |
| Main plugin types   | `src/main/core/plugin/types.ts`                  | Add `deeplinkHandler` to `PluginContributions`                                                              |
| Main plugin manager | `src/main/core/plugin/plugin-manager.ts`         | Collect `deeplinkHandlers` as `Contribution<DeeplinkHandler>[]`                                             |
| Main contributions  | `src/main/core/plugin/contributions.ts`          | Add `deeplinkHandlers` to `Contributions` type                                                              |
| Renderer deeplink   | `src/renderer/src/core/deeplink/subscription.ts` | **New** — `DeeplinkHandler` type, `startDeeplinkSubscription()`                                             |
| Renderer app        | `src/renderer/src/core/app.tsx`                  | Replace `DeeplinkHandler` component with oRPC subscription. Renderer plugin extensibility deferred (YAGNI). |
| Preload             | `src/preload/index.ts`                           | Remove `onDeeplink`                                                                                         |
| Preload types       | `src/preload/index.d.ts`                         | Remove `onDeeplink` from `NeovateApi`                                                                       |

## VS Code Reference

VS Code's URI handler system (`vscode://{extension-id}/{path}`) inspired our design. Key patterns adopted:

- **Unified handler interface** — VS Code uses a single `IURLHandler` for both built-in and extension handlers. We do the same.
- **Registration-order priority** — We route by name (more deterministic), app registers first so it always wins on conflicts.
- **URI buffering** — VS Code's `ExtensionUrlBootstrapHandler` caches URIs before the full handler is ready. We buffer in `DeeplinkService` + `consumePending()` pattern.

Key differences (complexity we skip):

- VS Code needs RPC between main process and sandboxed extension host — we don't (plugins run in-process)
- VS Code has lazy activation (`onUri` event) — our plugins are always loaded
- VS Code has trust confirmation dialogs — we can add this later if needed
- VS Code buffers URIs for up to 5 minutes with GC — we replay immediately after `activate()`
