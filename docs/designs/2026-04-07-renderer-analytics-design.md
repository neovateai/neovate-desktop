# Renderer Analytics

Extends the [behavior analytics design](2026-04-01-behavior-analytics-design.md) to support analytics plugins in the renderer process.

## 1. Background

The original analytics design routes all renderer events to `MainApp.analytics` via oRPC:

```
Renderer → oRPC → MainApp.analytics → plugins
```

This works for generic backends. But enterprise repos that need browser-specific SDKs (e.g. `@alipay/yuyan-monitor-sdk`) cannot use this path — the SDK cannot run in the Electron main process because it accesses browser globals (`window._to`, `document.title`, `navigator.sendBeacon`) without guards.

The fix is to give `RendererApp` its own `analytics` instance so browser-compatible plugins can run in the renderer directly.

## 2. Architecture

Main and renderer each own an independent `analytics` instance. This follows Electron's process isolation model — neither process imports from the other.

```
Renderer process                        Main process
────────────────────────────────        ──────────────────────────────────
RendererApp.analytics                   MainApp.analytics
  ← declarative click events              ← main plugin / agent events
  ← programmatic track() calls           ← direct this.analytics.track()
  ← page views                         ↓
  ↓                                     Node.js-compatible plugins
  browser-compatible plugins              (HTTP fetch, etc.)
    (browser SDKs, etc.)
```

Events are **not** duplicated. Each process tracks its own events:

| Source                              | Instance                | Example events                    |
| ----------------------------------- | ----------------------- | --------------------------------- |
| `data-track-id` clicks (core UI)    | `RendererApp.analytics` | `chat.send-button.clicked`        |
| `data-track-id` clicks (plugin)     | `RendererApp.analytics` | `plugin-git.branch.clicked`       |
| `useAnalyticsTrack()` in components | `RendererApp.analytics` | `page.viewed`, `settings.changed` |
| Plugin/agent lifecycle              | `MainApp.analytics`     | `agent.session.created`           |

The oRPC `analytics.track` route is **removed** — it was only a renderer→main bridge. Main-process code calls `this.analytics.track()` directly.

## 3. RendererApp Changes

### `RendererAppOptions`

```typescript
export interface RendererAppOptions {
  plugins?: RendererPlugin[];
  vendor?: VendorConfig;
  analyticsPlugins?: AnalyticsPlugin[]; // new
}
```

### `RendererApp`

```typescript
export class RendererApp implements IRendererApp {
  readonly analytics: AnalyticsInstance; // new

  constructor(options: RendererAppOptions = {}) {
    this.analytics = Analytics({
      app: APP_NAME, // from src/shared/constants.ts (__APP_NAME__ build-time variable)
      plugins: options.analyticsPlugins ?? [],
    });
    // ...existing unchanged
  }

  async start() {
    // ...existing unchanged...

    // click tracking for all window types
    this.subscriptions.push(initClickTracking(this.analytics));
  }
}
```

### `IRendererApp`

```typescript
import type { AnalyticsInstance } from "analytics";

export interface IRendererApp {
  readonly analytics: AnalyticsInstance; // new
  // ...existing unchanged
}
```

Plugins access analytics via `ctx.app.analytics` in `activate()` and `configContributions()`.

## 4. Collection Layer Changes

### `data-track.ts` — remove oRPC, accept analytics param

```typescript
export function initClickTracking(analytics: AnalyticsInstance): () => void {
  const handler = (e: MouseEvent) => {
    const el = (e.target as HTMLElement).closest?.("[data-track-id]") as HTMLElement | null;
    if (!el) return;
    analytics.track(el.dataset.trackId!, { trackType: "declarative-dom" });
  };
  document.addEventListener("click", handler);
  return () => document.removeEventListener("click", handler);
}
```

### `hooks/use-analytics-track.ts` — typed programmatic tracking

```typescript
import { useRendererApp } from "../../../core/app";

export function useAnalyticsTrack() {
  const app = useRendererApp();
  return useCallback(
    <T extends ProgrammaticEventName>(event: T, properties: ProgrammaticEventProperties<T>) => {
      app.analytics.track(event, { ...properties, trackType: "programmatic" });
    },
    [app],
  );
}
```

`track.ts` and `hooks.ts` — deleted.

## 5. Event Naming Convention

All event names follow `<namespace>.<object>.<action>`:

| Source                      | Namespace       | Example                      |
| --------------------------- | --------------- | ---------------------------- |
| Core renderer UI            | `<feature>`     | `page.viewed`, `chat.sent`   |
| Plugin-originated events    | `plugin-<name>` | `plugin-git.branch.switched` |
| Main process / agent events | `agent`         | `agent.session.created`      |

Rules:

- **No `ui.` prefix.** All renderer events are UI events by definition — the prefix adds no information.
- **Plugin events use `plugin-<name>` as the top-level namespace**, not the UI location (e.g. `plugin-git`, not `sidebar.git`). This decouples event names from layout — if a plugin moves from sidebar to a panel, its event names stay stable.
- **`trackType` property** (`"declarative-dom"` or `"programmatic"`) encodes the collection mechanism and is sufficient to distinguish event sources at query time.
- Use `plugin-*` as a glob in analytics backends to aggregate all plugin events across versions.

## 6. Enterprise Usage

Enterprise repos inject browser-compatible plugins via `RendererApp`:

```typescript
// Enterprise renderer entry (e.g. src/renderer/src/main.tsx)
new RendererApp({
  plugins: [...],
  analyticsPlugins: [myBrowserAnalyticsPlugin],
});
```

And Node.js-compatible plugins via `MainApp` as before:

```typescript
// Enterprise main entry
new MainApp({
  plugins: [...],
  analyticsPlugins: [myServerAnalyticsPlugin],
});
```

When no plugins are injected, events are collected but not sent (same no-op behavior as before).

## 7. HMR

`main.tsx` currently re-creates `RendererApp` on HMR without disposing the previous instance. This is a pre-existing issue, but analytics plugins (browser SDKs) are heavier than simple listeners and make it worse.

Fix: add HMR dispose in `main.tsx`:

```typescript
const app = new RendererApp({ ... });
app.start();

if (import.meta.hot) {
  import.meta.hot.dispose(() => app.stop());
}
```

`app.stop()` already calls `subscriptions.dispose()`, which cleans up click tracking. Analytics plugins that need teardown should implement the `analytics` plugin lifecycle (`loaded`/`unloaded`).

## 8. Decision Log

**1. Dual analytics instances vs single instance**

- Options: A) Keep single instance in main, find workaround for browser SDKs · B) Dual instances, one per process
- Decision: **B)** — Mirrors the existing process isolation model. Each process owns what it produces. No cross-process analytics coordination needed.

**2. How does renderer track() find its analytics instance?**

- Options: A) New React Context · B) Module-level singleton set at startup · C) Pass as parameter everywhere · D) Existing `useRendererApp()`
- Decision: **D)** — `analytics` is on `RendererApp`, and `useRendererApp()` already exists and is widely used. Components call `useRendererApp().analytics`. `data-track.ts` is outside the React tree so it receives the instance as a parameter from `RendererApp.start()`. No new Context or singleton needed.

**3. Should oRPC analytics route be removed?**

- Options: A) Remove it (renderer no longer needs it) · B) Keep it (main-process code may still call it directly)
- Decision: **A)** — Remove it. Main-process code calls `this.analytics.track()` directly, not via oRPC. The oRPC route was only a renderer→main bridge, and renderer now has its own analytics instance. Keeping it would leave two competing paths for renderer code.

**4. What if `analyticsPlugins` is empty?**

- Same behavior as `MainApp`: `analytics` instance is created but has no plugins, all events are no-ops. No conditionals needed.

**5. Event naming: should renderer events have a `ui.` namespace prefix?**

- Options: A) No prefix — `page.viewed`, `settings.changed` · B) `ui.` prefix — `ui.page.viewed`, `ui.settings.changed`
- Decision: **A)** — The renderer analytics instance only ever produces UI events, so `ui.` carries no information. The `trackType` property already distinguishes collection mechanism. Additionally, plugin events use `plugin-<name>` as their top-level namespace (e.g. `plugin-git.branch.switched`) rather than a UI location prefix (e.g. `sidebar.git`) — this keeps event names stable if a plugin is moved to a different part of the UI.

## 9. File Structure

Changes to existing files:

```
src/renderer/src/core/
  app.tsx             # + analyticsPlugins option, + analytics instance
  types.ts            # + analytics: AnalyticsInstance on IRendererApp

src/renderer/src/features/analytics/
  data-track.ts           # accept analytics param, remove oRPC import
  track.ts                # deleted
  hooks.ts                # deleted
  hooks/use-analytics-track.ts            # new — typed programmatic tracking

src/main/features/analytics/
  router.ts           # remove oRPC analytics route

src/shared/contract.ts  # remove analytics contract
```

No new files in the base repo. Enterprise repos add their own plugin implementations.
