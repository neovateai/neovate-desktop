# Query Status Loading Indicator

## Overview

Add a Claude Code-style loading indicator above the message input that shows during active queries. Displays an animated spinner, a randomly selected fun verb, elapsed time, and extended thinking duration.

Example: `✻ Quantumizing… (1m 33s · thought for 2s)`

## Architecture

```
chat-state.ts (store)     →  useQueryStatus() hook  →  <QueryStatus> component
  - turnStartedAt              - elapsed timer           - spinner animation
  - thinkingStartedAt          - verb selection           - status text
  - thinkingDuration           - spinner frame index      - conditional rendering
```

## Files to modify

1. `packages/desktop/src/renderer/src/features/agent/chat-state.ts` — add 3 fields + update on chunk processing
2. **New**: `packages/desktop/src/renderer/src/features/agent/hooks/use-query-status.ts` — hook
3. **New**: `packages/desktop/src/renderer/src/features/agent/components/query-status.tsx` — component + verbs list
4. `packages/desktop/src/renderer/src/features/agent/components/message-input.tsx` — render `<QueryStatus>` above the input box

## Store changes (`chat-state.ts`)

Add 3 fields to `ClaudeCodeChatStoreState`:

```typescript
turnStartedAt: number | null; // Date.now() when turn begins
thinkingStartedAt: number | null; // Date.now() when reasoning-start arrives
thinkingDuration: number | null; // ms, accumulated across all reasoning blocks in a turn
lastChunkAt: number | null; // Date.now() on each non-reasoning chunk (for stall detection)
```

### State transitions

- **Turn starts** (`status` → `"submitted"`): set `turnStartedAt = Date.now()`, clear `thinkingStartedAt` and `thinkingDuration`
- **`reasoning-start` chunk**: set `thinkingStartedAt = Date.now()`
- **`reasoning-end` chunk**: accumulate `thinkingDuration = (thinkingDuration ?? 0) + (Date.now() - thinkingStartedAt)`, clear `thinkingStartedAt` (supports multiple reasoning blocks per turn)
- **Turn ends** (`status` → `"ready"`): clear `turnStartedAt`, `thinkingStartedAt`, `thinkingDuration` after completion flash (see below)

## Hook (`useQueryStatus`)

```typescript
function useQueryStatus(sessionId: string | null): {
  isActive: boolean;
  phase: "active" | "completing" | "idle";
  verb: string;
  elapsedMs: number;
  thinkingDurationMs: number | null;
  isThinking: boolean;
  isStalled: boolean;
  spinnerFrame: string;
};
```

- Picks a random verb when turn starts (stable for the duration of the turn)
- Runs `setInterval(100ms)` during active turns for elapsed time + spinner frame updates
- Spinner frames: `["·", "✢", "✳", "✶", "✻", "✽"]` in ping-pong cycle (~200ms per frame)
- Cleans up interval on turn end
- **Completion flash**: on turn end, transitions to `phase: "completing"` for 2.5s before `"idle"` (shows past-tense verb)
- **Stalled detection**: `isStalled = true` if no non-reasoning chunk received for >3s during active turn. Reasoning chunks are excluded — during active thinking the user already sees "thinking..." and knows the model is alive. `lastChunkAt` only updates on text, tool, and other non-reasoning chunks.

## Component (`<QueryStatus>`)

Renders above the input as a slim status strip.

### Display format

```
{spinnerFrame} {Verb}… ({elapsed} · thought for {duration})
```

- Left-aligned, `text-xs text-muted-foreground`
- Spinner character in foreground color
- Elapsed timer formatted: `0s` → `59s` → `1m 0s` → `1h 2m 3s`
- "thought for Xs" shown only after thinking completes (not during active thinking)
- During active thinking: show "thinking..." with subtle pulse/opacity animation
- **Stalled state**: spinner color shifts to `text-destructive/60` when `isStalled` is true (no chunks for >3s)
- Strip fades in on appear, hidden when idle

### Completion flash

On turn end, briefly show past-tense result before hiding:

```
✻ Quantumized for 1m 33s
```

- Displayed for 2.5s with a fade-out transition
- Past tense stored as verb pairs `[gerund, pastTense]` (e.g. `["Quantumizing", "Quantumized"]`), not derived by suffix rules — too many irregular forms (Beboppin' → Bebopped, Dilly-dallying → Dilly-dallied, etc.)
- After fade-out, `phase` transitions to `"idle"` and store fields are cleared

### Render isolation

`useQueryStatus()` re-renders 10x/sec (100ms interval). To avoid re-rendering the entire `<MessageInput>` tree:

- `<MessageInput>` only decides whether to mount `<QueryStatus>` based on chat status (cheap, already available)
- `<QueryStatus>` calls `useQueryStatus()` internally — all timer/spinner re-renders are isolated to this component
- The parent never subscribes to the high-frequency hook

### Placement

Rendered inside `message-input.tsx`, between the message list and the input border container. Mounted when `status !== "ready"` or during the completion flash timeout.

## Verbs list (140+)

Full set from Claude Code CLI, stored as `[gerund, pastTense]` pairs:

```typescript
const VERBS: [string, string][] = [
  ["Accomplishing", "Accomplished"],
  ["Actioning", "Actioned"],
  ["Actualizing", "Actualized"],
  ["Architecting", "Architected"],
  ["Baking", "Baked"],
  ["Beaming", "Beamed"],
  ["Beboppin'", "Bebopped"],
  ["Befuddling", "Befuddled"],
  ["Billowing", "Billowed"],
  // ... (140+ pairs total, full list in query-status.tsx)
];
```

## Spinner animation

- Frames: `["·", "✢", "✳", "✶", "✻", "✽"]`
- Ping-pong: forward then reverse → `["·", "✢", "✳", "✶", "✻", "✽", "✻", "✶", "✳", "✢"]`
- ~200ms per frame (advance every 2 ticks of the 100ms interval)

## Timer formatting

```typescript
function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${s % 60}s`;
}
```

Show immediately from 0s (no threshold).
