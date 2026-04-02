# Typed Analytics Events

## 1. Background

The behavior analytics infrastructure (PR #391) provides a working pipeline:
`data-track-id` attributes / `track()` → oRPC → main process → `analytics` library plugins.

Event names and properties are currently untyped strings. Typos are silently swallowed and produce bad data.

## 2. Goal

- Single source of truth for programmatic event names and their properties schemas
- Type-safe at every programmatic callsite (compile time)
- Runtime validation at the oRPC boundary as final backstop
- Automatic `trackType` field — records how the event was triggered, no caller involvement required

## 3. Two Tracking Paths

| Path            | Attribute / API                         | `trackType`         | Properties             |
| --------------- | --------------------------------------- | ------------------- | ---------------------- |
| Declarative DOM | `data-track-id="ui.settings.navigated"` | `"declarative-dom"` | none — event name only |
| Programmatic    | `track("ui.page.viewed", { page })`     | `"programmatic"`    | typed per event schema |

**Declarative DOM is for user navigation flow** — recording where the user clicked, nothing more. Complex context goes in the programmatic path.

## 4. Design

### 4.1 Event Registry (`src/shared/features/analytics/events.ts`)

Only programmatic events are registered — they carry typed properties schemas. Declarative events are free-form strings validated only by naming convention (`a.b.c`).

```typescript
import { z } from "zod";

export const programmaticEventSchemas = {
  "ui.page.viewed": z.object({ page: z.string() }),
} satisfies Record<`${string}.${string}.${string}`, z.ZodObject<z.ZodRawShape>>;

export type ProgrammaticEventName = keyof typeof programmaticEventSchemas;
export type ProgrammaticEventProperties<T extends ProgrammaticEventName> = z.infer<
  (typeof programmaticEventSchemas)[T]
>;
```

### 4.2 Contract (`src/shared/features/analytics/contract.ts`)

`trackType` is metadata — it labels how the event was triggered but does not change the payload structure. One flat schema:

```typescript
import { z } from "zod";

export const trackInputSchema = z.object({
  trackType: z.enum(["declarative-dom", "programmatic"]),
  event: z.string().regex(/^[a-z]+(\.[a-z]+){2,}$/),
  properties: z.record(z.string(), z.unknown()).optional(),
});

export type TrackInput = z.infer<typeof trackInputSchema>;
```

Compile-time safety for event names and properties shapes is provided by the typed helpers — the contract only enforces the `a.b.c` naming convention and basic structure.

### 4.3 DOM attribute convention

Only one attribute: `data-track-id`. Value follows the `a.b.c` naming convention.

```tsx
<button data-track-id="ui.settings.navigated">
```

Analogous to `data-testid` — a single, purpose-specific attribute with a fixed convention. No registration required.

### 4.4 Global click listener (`data-track.ts`)

Reads `data-track-id`, injects `trackType: "declarative-dom"` automatically. No property parsing.

```typescript
const handler = (e: MouseEvent) => {
  const el = (e.target as HTMLElement).closest?.("[data-track-id]") as HTMLElement | null;
  if (!el) return;
  const event = el.dataset.trackId!;
  client.analytics.track({ trackType: "declarative-dom", event }).catch(() => {});
};
```

`closest("[data-track-id]")` handles all three cases in one call: the element itself, a child element (e.g. clicking an SVG inside a button), and nested tracked elements (stops at the nearest one).

### 4.5 `track()` helper (`src/renderer/src/features/analytics/track.ts`)

Typed wrapper for programmatic calls. Injects `trackType: "programmatic"` automatically.

```typescript
export function track<T extends ProgrammaticEventName>(
  event: T,
  properties: ProgrammaticEventProperties<T>,
): void {
  client.analytics.track({ trackType: "programmatic", event, properties }).catch(() => {});
}
```

`properties` matches the naming used by the underlying `analytics` library.

## 5. Type Safety Summary

| Layer                          | What's checked                                 | When          |
| ------------------------------ | ---------------------------------------------- | ------------- |
| `data-track-id` value          | `a.b.c` format at runtime                      | oRPC boundary |
| `track(event, props)` callsite | event name ∈ registry, properties match schema | Compile time  |
| oRPC contract                  | `trackType`, event format, properties shape    | Runtime       |

`data-track-id` values are plain strings in JSX — no static type constraint. Convention + runtime validation is the backstop. The programmatic path is fully type-safe end-to-end.

## 6. Adding Events

**New declarative event** — just add `data-track-id="ui.sidebar.toggled"` in JSX. No registration needed.

**New programmatic event** — add one entry to `programmaticEventSchemas`:

```typescript
"ui.model.changed": z.object({ model: z.string(), provider: z.string() }),
```

## 7. Migration Steps

1. Create `src/shared/features/analytics/events.ts`
2. Update `src/shared/features/analytics/contract.ts` — flat schema with `trackType`
3. Create `src/renderer/src/features/analytics/track.ts` — typed `track()` helper
4. Update `src/renderer/src/features/analytics/data-track.ts` — use `data-track-id`, `dataset.trackId`, inject `trackType`, remove property parsing
5. Update `src/renderer/src/features/analytics/hooks.ts` — use `track()`
6. Update all JSX callsites — replace `data-track` / `data-track-*` with `data-track-id`
7. Update tests
8. Run `bun ready`
