# Context Left Indicator

**Date:** 2026-03-23
**Status:** Draft

## Goal

Show remaining context window percentage as text below the message input, next to the branch switcher. Minimal, text-only — e.g. `ctx 78%`. Hover tooltip shows raw token counts.

## Data Source

Two pieces of data, combined on the **main process** side:

1. **`stream_event` → `message_start`** (`BetaRawMessageStartEvent`): carries `BetaMessage.usage` with per-API-call token counts. The **last** `message_start` before a turn ends reflects the actual context window fill level, because each API call sends the full conversation as input.

2. **`SDKResultMessage`** (type: `"result"`): carries `modelUsage: Record<string, ModelUsage>` which includes `contextWindow` (the total context window size for the model).

### Why two sources?

- `SDKResultMessage.usage` is **cumulative billing usage** across all API calls in the turn. Using it for context % would massively overcount, because the same conversation tokens are re-sent on every API call within a turn (tool-call loops).
- `message_start.usage.input_tokens` reflects the **actual input** sent to the API on that specific call — i.e., how much of the context window is currently occupied.
- `contextWindow` is only available on `ModelUsage` in the `result` message.

### Channel problem and solution

`message_start` and `result` flow through different renderer channels:

- `message_start` → `SDKMessageTransformer` → message stream (UI rendering)
- `result` → `toUIEvent()` → event stream → `chat.ts#handleEvent()`

They never meet on the renderer side. But on the main process, both originate from the same loop in `session-manager.ts:stream()` (line ~840). **Solution: track `message_start` usage in the main process and attach context data to the `result` event before publishing it to the renderer.**

### Why not live (mid-stream) updates?

The `message_start` events fire during streaming, but we only update the displayed value at turn end:

- During a turn with tool calls, intermediate `message_start` events show growing context, but the final value (after all tool results are appended) is what matters for the user's next decision.
- Avoids flickering UI during rapid tool-call loops.
- Keeps the renderer simple — just reads a pre-computed value from the event.

## Computation (main process)

In `session-manager.ts:stream()`, the loop that processes raw SDK messages:

```ts
// Per-session state, reset each turn
let lastInputTokens = 0;

for await (const value of query) {
  // Track message_start usage (top-level only)
  if (
    value.type === "stream_event" &&
    value.event.type === "message_start" &&
    value.parent_tool_use_id === null
  ) {
    const usage = value.event.message.usage;
    lastInputTokens =
      (usage.input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0);
  }

  // When result arrives, compute context % and attach
  if (value.type === "result") {
    const contextWindowSize = Object.values(value.modelUsage)[0]?.contextWindow ?? 0;
    const remainingPct =
      contextWindowSize > 0
        ? Math.max(0, Math.min(100, Math.round((1 - lastInputTokens / contextWindowSize) * 100)))
        : 0;
    // Attach to the event before publishing
    // (extend the event type or publish a separate context_usage event)
  }

  // existing: toUIEvent + transformer
}
```

## Architecture

```
session-manager.ts:stream() — single loop over raw SDKMessage
  │
  ├─ stream_event (message_start, parent_tool_use_id === null)
  │    → update lastInputTokens (per-session state)
  │
  ├─ result
  │    → read contextWindow from modelUsage
  │    → compute remainingPct from lastInputTokens
  │    → publish context_usage event via eventPublisher
  │
  ├─ toUIEvent(value) → eventPublisher (existing)
  └─ transformer.transformWithAggregation(value) → message stream (existing)

         ▼ (renderer)

chat.ts #handleEvent()
  → receives context_usage event
  → calls agentStore.setSessionUsage()

         ▼

ContextLeftIndicator component (next to BranchSwitcher)
  → reads from store
  → displays "ctx 78%"
  → tooltip: "85k / 200k tokens"
  → color changes by threshold
```

## Event Type

Add a new event to `ClaudeCodeUIEventPart` in `shared/claude-code/types.ts`:

```ts
type ContextUsageEvent = {
  type: "context_usage";
  contextWindowSize: number;
  usedTokens: number;
  remainingPct: number;
};
```

Published from `session-manager.ts` alongside (or instead of extending) the `result` event.

## Store Changes

Extend existing `SessionUsage` in `features/agent/store.ts`:

```ts
export type SessionUsage = {
  totalCostUsd: number;
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  // context window tracking
  contextWindowSize: number;
  contextUsedTokens: number;
  remainingPct: number;
};
```

Add `setSessionUsage` action to `AgentState`.

## UI

Position: below the input box, same row as `BranchSwitcher`, right-aligned.

```
┌──────────────────────────────────────┐
│  [editor content]                    │
│  [toolbar: model | mode | send]      │
├──────────────────────────────────────┤
│  branch: main              ctx 78%   │
└──────────────────────────────────────┘
```

### Display

- Text: `ctx {remainingPct}%` — small `text-xs` matching branch switcher style.
- Color thresholds (using existing design tokens):
  - `>50%` remaining: `text-muted-foreground` (calm, neutral)
  - `20–50%`: `text-warning` or yellow-ish (heads up)
  - `<20%`: `text-destructive` (context is running low)
- Component returns `null` until the first `result` event arrives (no data = no display).

### Tooltip

On hover, show raw token counts via `title` attribute:

- `≥1k`: format as `85k / 200k tokens used`
- `<1k`: format as `850 / 200k tokens used`

## Files to Change

| File                                                  | Change                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `shared/claude-code/types.ts`                         | Add `ContextUsageEvent` to `ClaudeCodeUIEventPart`                                      |
| `main/features/agent/session-manager.ts`              | Track `lastInputTokens` from `message_start`, publish `context_usage` event on `result` |
| `renderer/features/agent/store.ts`                    | Add `setSessionUsage` action, extend `SessionUsage` type                                |
| `renderer/features/agent/chat.ts`                     | Handle `context_usage` event in `#handleEvent`, call store                              |
| `renderer/features/agent/components/context-left.tsx` | New component (~25 lines)                                                               |
| `renderer/features/agent/components/agent-chat.tsx`   | Render `ContextLeft` next to `BranchSwitcher`                                           |

## Edge Cases

- **No data yet**: Hidden until first turn completes
- **Compaction**: Next turn's `message_start` will have lower `input_tokens` — percentage naturally recovers
- **Multiple models in `modelUsage`**: Use the first entry's `contextWindow` (typically only one model per session)
- **Provider sessions (non-SDK)**: Same event structure from intercepted API responses — works identically
- **Sub-agent `message_start` events**: Only track top-level (`parent_tool_use_id === null`) to avoid counting sub-agent context as the main session's context
- **Token formatting**: `≥1k` → `85k`, `<1k` → raw number (e.g., `850`)
