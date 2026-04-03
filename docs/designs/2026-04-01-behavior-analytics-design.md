# Behavior Analytics

## 1. Background

The app currently has zero analytics infrastructure. To drive product improvement and business analytics (feature usage frequency, user retention, conversion), we need a behavior analytics system that:

- Tracks feature usage (Agent sessions) and UI interactions (clicks, page views)
- Sends events to a self-hosted backend via batched HTTP
- Supports enterprise repos that `new MainApp()` / `new RendererApp()` as a submodule and need their own backend

## 2. Requirements Summary

**Goal:** Add a centralized, extensible behavior analytics system.

**Scope:**

- In scope: Event collection infrastructure, hybrid collection strategy (declarative + manual), enterprise extensibility via `analytics` plugins
- Out of scope (for now): Privacy/consent UI, error/crash monitoring, OpenTelemetry tracing, batching (backend may not support), oRPC middleware auto-tracking

## 3. Acceptance Criteria

1. `MainApp` owns the `analytics` instance, exposed via `IMainApp` interface
2. Renderer UI click events are collected via `data-track-*` attributes (declarative, no JS per component)
3. Non-click events (page views, session lifecycle) are trackable via `client.analytics.track()` oRPC call
4. Enterprise repos can inject their own analytics plugin via `MainApp` constructor — no code changes in base repo
5. When no plugin is provided, events are collected but not sent (no-op)
6. `bun ready` passes with the changes

## 4. Architecture

### Overview

```
Renderer                                  Main Process
┌────────────────────────────┐           ┌──────────────────────────────────────┐
│                            │           │                                      │
│  data-track click listener │──oRPC──→  │  MainApp.analytics                    │
│  useTrackPageView()        │──oRPC──→  │    = analytics({ plugins })          │
│  manual track()            │──oRPC──→  │         ↓                            │
│                            │           │  Agent events → direct track()       │
│                            │           │         ↓                            │
│                            │           │  analytics dispatches to ALL plugins │
│                            │           │    ├→ plugin A: transform → POST /a  │
│                            │           │    ├→ plugin B: transform → POST /b  │
│                            │           │    └→ plugin C: transform → POST /c  │
└────────────────────────────┘           └──────────────────────────────────────┘
```

**Single pipeline:** All events flow to `MainApp.analytics`. The renderer is purely a collection layer — it never sends to any backend directly.

### Library Choice

Use [`analytics`](https://github.com/DavidWells/analytics) (by David Wells):

- Standard `track` / `identify` / `page` API (Segment-compatible)
- Plugin architecture — each plugin is a `{ name, track, identify, page }` object
- Browser + Node.js support (works in Electron main process)
- ~15KB, zero heavy dependencies

**Why not OpenTelemetry:** OTel is designed for distributed tracing (spans, traces). Our use case is product behavior analytics (flat events). Different problem domain.

### Enterprise Extensibility

Enterprise repos use the base repo as a submodule and instantiate `MainApp` directly:

```typescript
// Enterprise repo
import { MainApp } from "neovate-desktop";

const app = new MainApp({
  plugins: [
    /* enterprise business plugins */
  ],
  analyticsPlugins: [enterpriseTrackPlugin({ endpoint: "https://enterprise-api/events" })],
});
```

- `MainApp` accepts an optional `analyticsPlugins` array
- Base repo provides collection infrastructure; enterprise provides the send plugin(s)
- Enterprise renderer code can use the same `data-track` attributes and `client.analytics.track()` — no extra setup
- `RendererApp` does NOT need analytics plugin config (all events route through main via oRPC)
- Enterprise plugins have **full control** over format transformation and dispatch targets — each plugin independently receives every event and decides how to transform and where to send it
- Multiple plugins can be registered simultaneously (e.g., internal analytics + audit log + third-party)

```typescript
// Enterprise: multi-backend with custom format transformation
new MainApp({
  analyticsPlugins: [
    // Plugin 1: internal analytics — custom format
    {
      name: "internal-analytics",
      track: ({ payload }) => {
        const transformed = {
          action: payload.event,
          data: payload.properties,
          ts: payload.meta.ts,
        };
        fetch("https://analytics.enterprise.com/events", {
          method: "POST",
          body: JSON.stringify(transformed),
        });
      },
    },
    // Plugin 2: audit log — different format, different endpoint
    {
      name: "audit-log",
      track: ({ payload }) => {
        fetch("https://audit.enterprise.com/log", {
          method: "POST",
          body: JSON.stringify({
            type: "user_action",
            name: payload.event,
            metadata: payload.properties,
          }),
        });
      },
    },
  ],
});
```

## 5. Decision Log

**1. Where does the analytics instance live?**

- Options: A) On `MainApp` via `IMainApp` interface · B) Separate `MainApp.analytics` class · C) External services bag
- Decision: **A)** — `MainApp` owns and creates the `analytics` instance in its constructor. Exposed via `IMainApp.analytics`. No wrapper class — the `analytics` library API is already clean enough to use directly. Plugins access via `ctx.app.analytics`, routers via `context.mainApp.analytics`.

**2. How are UI click events collected?**

- Options: A) Manual `analytics.track()` in every component · B) Global click listener + `data-track-*` attributes · C) Hybrid
- Decision: **C) Hybrid** —
  - `data-track-*` for click events (~60% of UI events, zero JS per component)
  - Manual `track()` for non-click events (session lifecycle, async operations)

**4. What library?**

- Options: A) `analytics` (David Wells) · B) PostHog/Mixpanel SDK · C) Custom from scratch
- Decision: **A)** — Plugin system matches the enterprise extensibility requirement. Standard Segment-compatible API. Lightweight.

**5. What about enterprise repos?**

- Options: A) Enterprise forks the analytics code · B) Enterprise injects plugins via constructor · C) Config-driven backend URL
- Decision: **B)** — Enterprise passes `analyticsPlugins` to `MainApp` constructor. Base repo stays backend-agnostic.

**6. Can enterprise plugins customize event format and target multiple endpoints?**

- Options: A) Fixed event format, single endpoint URL config · B) Plugin receives raw payload, full control over transform and dispatch
- Decision: **B)** — Each analytics plugin receives the raw event payload and independently decides how to transform the format and where to send it. Multiple plugins can coexist, each with its own format and endpoint(s). The `analytics` library calls every registered plugin for every event.

## 6. File Structure

```
src/shared/features/analytics/
  contract.ts              # oRPC contract: track
  types.ts                 # AnalyticsEvent, AnalyticsPlugin re-exports

src/main/features/analytics/
  router.ts                # oRPC router: receives events from renderer

src/renderer/src/features/analytics/
  data-track.ts            # Global click listener for data-track-* attributes
  hooks.ts                 # useTrackPageView, useTrackEvent
```

The `analytics` instance lives directly on `MainApp` — no wrapper class needed. No oRPC middleware — event tracking is explicit, not automatic.

## 7. Detailed Design

### 7.1 Event Shape

```typescript
// src/shared/features/analytics/types.ts
interface AnalyticsEvent {
  event: string; // "agent.session.created", "ui.page.viewed"
  properties: Record<string, unknown>;
  timestamp: number; // Unix ms, auto-filled
  sessionId: string; // App session ID, auto-filled
}
```

### 7.2 oRPC Contract

```typescript
// src/shared/features/analytics/contract.ts
export const analyticsContract = {
  track: oc.input(
    z.object({
      event: z.string(),
      properties: z.record(z.unknown()).default({}),
    }),
  ),
};
```

### 7.3 MainApp & IMainApp Integration

```typescript
// src/main/core/types.ts (modified)
import type { AnalyticsInstance } from "analytics";

export interface IMainApp {
  readonly subscriptions: { push(...disposables: Disposable[]): void };
  readonly windowManager: IBrowserWindowManager;
  readonly analytics: AnalyticsInstance; // NEW
}
```

```typescript
// src/main/app.ts (modified)
import Analytics from "analytics";

export class MainApp implements IMainApp {
  readonly analytics: AnalyticsInstance;

  constructor(options: {
    plugins?: MainPlugin[];
    analyticsPlugins?: AnalyticsPlugin[]; // NEW
  }) {
    this.analytics = Analytics({
      app: "neovate-desktop",
      plugins: options.analyticsPlugins ?? [],
    });
    // ... existing init
  }
}
```

No wrapper class. The `analytics` library instance is used directly.

**Access patterns:**

```typescript
// Plugin (via PluginContext.app)
activate(ctx) {
  ctx.app.analytics.track("plugin.activated", { name: this.name })
}

// oRPC router handler (via AppContext.mainApp)
handler(({ context }) => {
  context.mainApp.analytics.track("agent.session.created", { model })
})

// MainApp internal code
this.analytics.track("app.started")
```

### 7.4 oRPC Router

```typescript
// src/main/features/analytics/router.ts
export const analyticsRouter = implement(analyticsContract)
  .$context<AppContext>()
  .router({
    track: os.handler(({ input, context }) => {
      context.mainApp.analytics.track(input.event, input.properties);
    }),
  });
```

### 7.5 Declarative Click Tracking (Renderer)

```typescript
// src/renderer/src/features/analytics/data-track.ts
export function initClickTracking() {
  document.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement).closest("[data-track]");
    if (!el) return;

    const event = el.getAttribute("data-track")!;
    const properties: Record<string, string> = {};
    for (const attr of el.attributes) {
      if (attr.name.startsWith("data-track-") && attr.name !== "data-track") {
        properties[attr.name.slice(11)] = attr.value;
      }
    }

    client.analytics.track({ event, properties });
  });
}
```

Called once at renderer app init.

### 7.6 React Hooks

```typescript
// src/renderer/src/features/analytics/hooks.ts
export function useTrackPageView(page: string) {
  useEffect(() => {
    client.analytics.track({ event: "ui.page.viewed", properties: { page } });
  }, []);
}

export function useTrackEvent() {
  return (event: string, properties?: Record<string, unknown>) => {
    client.analytics.track({ event, properties: properties ?? {} });
  };
}
```

### 7.7 Usage Examples

```tsx
// Declarative click tracking — just add attributes
<button data-track="agent.model.changed" data-track-model={model}>
  Switch Model
</button>;

// Page view tracking — one line in component
function SettingsPage() {
  useTrackPageView("settings");
  return <div>...</div>;
}

// Manual tracking — for async/non-click events
const trackEvent = useTrackEvent();
const onSessionEnd = () => {
  trackEvent("agent.session.ended", { duration, messageCount });
};

// Enterprise-specific events — same API, zero extra config
<button data-track="enterprise.sso.login">SSO Login</button>;
```

## 8. Hybrid Collection Summary

| Strategy                             | Coverage                 | Where    | Mechanism                                 |
| ------------------------------------ | ------------------------ | -------- | ----------------------------------------- |
| `data-track-*` attributes            | UI click events (~60%)   | Renderer | Global click listener → oRPC              |
| `useTrackPageView` / `useTrackEvent` | Page views, async events | Renderer | React hooks → oRPC                        |
| Direct `this.analytics.track()`      | Agent session events     | Main     | Called in MainApp / plugin business logic |

## 9. Initial Event Catalog

### Agent Events (Main Process)

| Event                   | Properties                 | Trigger         |
| ----------------------- | -------------------------- | --------------- |
| `agent.session.created` | `model`, `provider`        | Session created |
| `agent.message.sent`    | `type` (user/system)       | Message sent    |
| `agent.session.ended`   | `duration`, `messageCount` | Session ended   |

### UI Events (Renderer)

| Event                 | Properties         | Collection              |
| --------------------- | ------------------ | ----------------------- |
| `ui.page.viewed`      | `page`             | `useTrackPageView` hook |
| `ui.settings.changed` | `key` (no value)   | `data-track`            |
| `ui.project.switched` | —                  | `data-track`            |
| `ui.plugin.used`      | `plugin`, `action` | `data-track`            |

## 10. Open Questions

1. **Privacy/consent** — Opt-in vs opt-out? First-run dialog? (Deferred to separate design)
2. **User identification** — Anonymous device ID vs authenticated user ID?
3. **Backend API contract** — Event payload format alignment with existing backend
4. **Batching** — Backend may not support batch endpoints; deferred until backend API is defined
5. **Offline persistence** — Persist to disk on network failure? Max buffer size?
