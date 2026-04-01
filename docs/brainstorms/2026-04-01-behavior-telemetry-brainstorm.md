# Behavior Telemetry Brainstorm

**Date:** 2026-04-01
**Status:** Ready for planning

## What We're Building

A centralized behavior telemetry system that tracks feature usage and user interactions across the Neovate Desktop app. The system collects events in the main process and batch-sends them to an existing backend service.

**Goals:**
- Product improvement: understand how users interact with features, identify pain points
- Business analytics: user growth, retention, conversion metrics
- NOT in scope (for now): error/crash monitoring, quality tracking

## Why This Approach

**Architecture: Main Process Centralized (方案 A)**

All telemetry flows through a single `TelemetryService` in the main process:

```
Renderer (UI events) → oRPC → TelemetryService (main) → HTTP batch → Backend API
Main (Agent events)  →  direct  → TelemetryService (main) ↗
```

**Reasons:**
1. Agent session data already lives in main process — no need to shuttle it to renderer
2. Single point of control for batching, retry, offline caching, and consent checks
3. Follows the existing feature pattern (`src/main/features/telemetry/`)
4. oRPC IPC is already lightweight; UI event volume won't be a bottleneck
5. Simpler than dual-layer (方案 B) — one event pipeline, one flush schedule

**Rejected alternatives:**
- **Dual-layer (B):** Two send pipelines, two retry/cache systems — unnecessary complexity for current scale
- **Plugin mode (C):** Telemetry is infrastructure, not optional functionality; plugins lack deep hooks for internal event monitoring

## Key Decisions

1. **Centralized in main process** — TelemetryService handles all event collection, buffering, and dispatch
2. **Batch sending** — Events buffered locally, flushed on interval or count threshold (not real-time)
3. **Self-hosted backend** — Events sent to existing backend service via HTTP API
4. **Event scope: Feature usage + UI interactions** — Agent sessions (create, message, model selection, duration) and UI operations (page navigation, settings changes, plugin usage)
5. **Privacy/consent: TBD** — Will decide on opt-in/opt-out mechanism later
6. **Use `analytics` library** (by David Wells) — Provides standard track/identify/page API + plugin system; write a custom plugin for self-hosted backend
7. **Hybrid event collection** — Three complementary strategies:
   - **Declarative `data-track`** — Global click listener + `data-track-*` attributes on elements for UI click events (~60%)
   - **Manual `analytics.track()`** — For non-click events: session lifecycle, async operations, page views
   - **oRPC middleware** — Auto-track all IPC calls at the router level

## Architecture Sketch

### New Files

```
src/shared/features/telemetry/
  contract.ts          # oRPC contract: trackEvent, trackBatch, getConfig
  types.ts             # TelemetryEvent, EventPayload, TelemetryConfig types

src/main/features/telemetry/
  telemetry-service.ts # Core service: event queue, batching, HTTP dispatch
  router.ts            # oRPC router implementing the contract
  middleware.ts        # oRPC telemetry middleware for auto-tracking IPC calls

src/renderer/src/features/telemetry/
  tracker.ts           # Thin wrapper: convenience methods for UI event tracking
  hooks.ts             # React hooks: useTrackPageView
  data-track.ts        # Global click listener for data-track-* declarative events
```

### Event Shape (Draft)

```typescript
interface TelemetryEvent {
  event: string           // e.g. "agent.session.created", "ui.page.viewed"
  properties: Record<string, unknown>
  timestamp: number       // Unix ms
  sessionId: string       // App session ID
  userId?: string         // Anonymous or authenticated ID
}
```

### Batching Strategy

- Buffer events in memory queue
- Flush when: queue reaches N events OR interval timer fires (e.g. 30s)
- On app quit: flush remaining events synchronously
- On network failure: persist to disk, retry on next app start

## Event Categories (Initial)

### Agent Events (captured in main process)
- `agent.session.created` — model, provider
- `agent.message.sent` — message type (user/system)
- `agent.session.ended` — duration, message count

### UI Events (captured in renderer, sent via oRPC)
- `ui.page.viewed` — page/panel name
- `ui.settings.changed` — setting key (not value)
- `ui.project.switched` — (no PII)
- `ui.plugin.used` — plugin name, action

## Open Questions

1. **Privacy/consent model** — Opt-in vs opt-out? First-run dialog? (Deferred)
2. **User identification** — Anonymous device ID? Authenticated user ID? Both?
3. **Backend API contract** — What does the existing backend expect? Need to align event format
4. **Data retention policy** — How long to keep events?
5. **Offline buffer size** — Max events to persist to disk when offline?
