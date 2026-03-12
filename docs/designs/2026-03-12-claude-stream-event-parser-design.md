# Claude Agent SDK `stream_event` Parsing Design

## 1. Background

The current Agent Chat message stream implementation mainly relies on full `assistant`, `user`, and `result` messages to produce `ClaudeCodeUIMessageChunk`. That path is good enough for history replay and non-streaming responses, but it does not yet understand Claude Agent SDK incremental events with `type: "stream_event"`.

In the current dependency version:

- Claude Agent SDK models incremental events as `SDKPartialAssistantMessage`
- The event payload is Anthropic raw streaming data: `BetaRawMessageStreamEvent`
- AI SDK's UI layer requires chunk ordering to be valid. Invalid `text-delta`, `reasoning-delta`, or `tool-input-delta` chunks will trigger `UIMessageStreamError`

Relevant references:

- [Anthropic Streaming Messages](https://platform.claude.com/docs/en/build-with-claude/streaming)
- [AI SDK Stream Protocol](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- `packages/desktop/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
- `packages/desktop/node_modules/ai/src/ui/process-ui-message-stream.ts`
- `packages/desktop/node_modules/ai/src/generate-text/stream-text.ts`

## 2. Goals

This document only covers the `stream_event` layer. It intentionally does not expand into other SDK message types such as `system`, `result`, or permission requests.

Phase 1 goals:

1. Add `stream_event` parsing to `SDKMessageTransformer`
2. Reuse the same event-driven state machine model as the AI SDK Anthropic provider
3. Fully support `text` first
4. Reserve clean extension points for `thinking` and `toolcall`
5. Guarantee that emitted `ClaudeCodeUIMessageChunk` values are always valid for AI SDK
6. Prefer Claude Agent SDK and AI SDK types directly instead of introducing new shared parser types

Non-goals:

1. Changing the subscribe event stream in this phase
2. Rewriting `result` finish semantics in this phase
3. Handling every Anthropic block type in this phase

## 3. Overall Design

The design principle is not "copy the AI SDK provider as-is". It is "reuse the same state machine, but change the output target to `UIMessageChunk`".

In other words, this repository should use this pipeline:

```text
SDKPartialAssistantMessage.event
  -> stream_event parser state machine
  -> ClaudeCodeUIMessageChunk
```

Not this one:

```text
SDKPartialAssistantMessage.event
  -> LanguageModelV3StreamPart
  -> TextStreamPart
  -> UIMessageChunk
```

The reason is straightforward:

- The backend already emits `ClaudeCodeUIMessageChunk` directly
- The current ChatTransport already consumes a chunk stream directly, so it does not need the provider layer
- Emitting `UIMessageChunk` directly is shorter and easier to compose with the existing `result` branch

Because of that, this design introduces a lightweight state machine inside `SDKMessageTransformer` dedicated to `stream_event`.

Suggested private state fields:

- `hasMessageStart: boolean`
- `currentMessageId: string | null`
- `currentSessionId: string | null`
- `currentParentToolUseId: string | null`
- `emittedMessageIds: Set<string>`
- `activeTextBlocks: Map<number, { partId: string; closed: boolean }>`
- `activeThinkingBlocks: Map<number, { partId: string; closed: boolean }>`
- `activeToolBlocks: Map<number, { partId: string; toolCallId: string; toolName: string; inputBuffer: string; closed: boolean }>`

Where:

- `currentMessageId` binds multiple content blocks to the same assistant message
- `active*Blocks` enforce legal `start -> delta -> end` ordering
- `emittedMessageIds` enable cross-branch deduplication so the later full `assistant` message does not render the same content again

## 4. Cross-Type Constraints

Whether the block is `text`, `thinking`, or `toolcall`, all of them must follow the same core constraints.

### 4.1 Shared Message Context

- `message_start` is the beginning of an assistant message lifecycle
- `message_start.message.id` is the stable primary key for that streamed message
- All content blocks belonging to the same streamed message must be attached to that `message.id`

### 4.2 Part ID Generation

We should not use Anthropic `index` directly as the UI part id.

Recommended rule:

```ts
const partId = `${kind}:${messageId}:${index}`;
```

Examples:

- `text:msg_123:0`
- `reasoning:msg_123:1`
- `tool:msg_123:2`

This avoids:

- Block index collisions across different messages
- ID collisions across different block kinds

### 4.3 Legal Chunk Sequence

From AI SDK's point of view, the following order must hold:

```text
start? -> start-step? -> part-start -> part-delta* -> part-end
```

For `text`, that becomes:

```text
start -> start-step -> text-start -> text-delta* -> text-end
```

Therefore the parser must guarantee:

1. Never emit `text-delta` before `text-start`
2. Never emit `text-end` before `text-start`
3. Drop later deltas for a block once that block has been closed
4. Do not let the `stream_event` text parser own `finish-step` or `finish`

### 4.4 Type Strategy

This implementation should avoid inventing new shared public types whenever Claude Agent SDK or AI SDK already defines an equivalent type.

Preferred sources of truth:

- Claude Agent SDK types for raw input:
  - `SDKPartialAssistantMessage`
  - `BetaRawMessageStreamEvent`
  - `BetaRawMessageStartEvent`
  - `BetaRawContentBlockStartEvent`
  - `BetaRawContentBlockDeltaEvent`
  - `BetaRawContentBlockStopEvent`
- AI SDK types for output:
  - `ClaudeCodeUIMessageChunk`
  - `ProviderMetadata`
  - existing `UIMessageChunk` protocol semantics

Practical rule:

1. Do not add new shared types under `shared/claude-code` just to model `stream_event`
2. Do not add a parallel custom event model that duplicates Anthropic raw event types
3. If small helper state is still needed inside `SDKMessageTransformer`, keep it private and local to the file
4. Even private helper state should prefer SDK-native fields and AI SDK-native chunk shapes over new wrapper types

### 4.5 Deduplication Strategy

Deduplication happens at two levels:

1. In-stream deduplication
   - A given `content_block_start` should emit `text-start` only once
   - Once a block has emitted `text-end`, later repeated stop or delta events for that block are ignored

2. Cross-branch deduplication
   - Once a `message.id` has emitted content through `stream_event`, record it in `emittedMessageIds`
   - If a later full `assistant` message arrives with the same `message.id`, the full assistant branch must skip it

## 5. Text Design

`text` is the only fully implemented target for Phase 1.

### 5.1 Supported Raw Events

In this phase we only consume the following `stream_event.event.type` values:

- `message_start`
- `content_block_start`
- `content_block_delta`
- `content_block_stop`
- `message_delta`
- `message_stop`

Only these actually produce UI chunks:

- `message_start`
- `content_block_start(text)`
- `content_block_delta(text_delta)`
- `content_block_stop(text)`

### 5.2 Text State Machine

```text
idle
  -- message_start -->
message-open
  -- content_block_start(text) -->
text-open
  -- content_block_delta(text_delta) -->
text-open
  -- content_block_stop -->
message-open
  -- message_stop -->
message-open (wait for result to finish)
```

Important note:

- `message_stop` does not emit `finish`
- The repository continues to use the `result` branch to emit `finish-step` and `finish`
- This keeps behavior aligned with the current `session-manager.stream()` finish semantics

### 5.3 Mapping Rules

#### `message_start`

Input:

```ts
{
  type: ("message_start", message);
}
```

Output:

1. If the transformer has not emitted `start` yet, emit:

```ts
{
  type: "start",
  messageId: message.id,
  messageMetadata: {
    sessionId,
    parentToolUseId,
  },
}
```

2. If this is a new `message.id`, emit:

```ts
{
  type: "start-step";
}
```

And update:

- `currentMessageId = message.id`
- `emittedMessageIds.add(message.id)`
- clear the previous message's `activeTextBlocks`

#### `content_block_start(text)`

Input:

```ts
{
  type: "content_block_start",
  index,
  content_block: { type: "text", ... }
}
```

Output:

```ts
{
  type: "text-start",
  id: `text:${currentMessageId}:${index}`,
}
```

At the same time, register:

```ts
activeTextBlocks.set(index, {
  partId,
  closed: false,
});
```

#### `content_block_delta(text_delta)`

Input:

```ts
{
  type: "content_block_delta",
  index,
  delta: { type: "text_delta", text }
}
```

Output:

```ts
{
  type: "text-delta",
  id: `text:${currentMessageId}:${index}`,
  delta: text,
}
```

Constraints:

- The corresponding block must already exist in `activeTextBlocks`
- If `text === ""`, do not emit a chunk
- If the block is already `closed`, ignore it

#### `content_block_stop(text)`

Input:

```ts
{
  type: ("content_block_stop", index);
}
```

Output:

```ts
{
  type: "text-end",
  id: `text:${currentMessageId}:${index}`,
}
```

Then mark the block as `closed: true` and remove it from `activeTextBlocks`.

#### `message_delta`

This phase does not emit UI chunks for `message_delta`.

Optional information worth preserving later:

- `stop_reason`
- `usage`

If we later decide to expose usage through UI metadata, this is the extension point.

#### `message_stop`

This phase does not emit UI chunks for `message_stop`.

Reason:

- The current message finish path is already centralized in `result`
- Emitting `finish` at `message_stop` would duplicate the existing `result` finish behavior

### 5.4 Handling Invalid Order

To guarantee that `UIMessageChunk` stays valid, this phase uses "drop and debug log" for invalid order instead of throwing.

That includes:

- `content_block_delta(text_delta)` without a matching `content_block_start(text)`
- `content_block_stop` without an active text block
- `content_block_start(text)` when there is no current `currentMessageId`

Reason:

- `stream_event` is external SDK input
- Throwing would terminate the full message stream
- Dropping malformed events is safer than emitting illegal chunks and crashing AI SDK stream processing

### 5.5 Type Usage for Text

The text implementation should consume Anthropic raw event types directly instead of converting them into intermediate custom models first.

Concretely:

- inspect `event.type` on `BetaRawMessageStreamEvent`
- narrow `content_block` using SDK-provided block types
- narrow `delta` using SDK-provided delta types such as `BetaTextDelta`
- emit `ClaudeCodeUIMessageChunk` directly

The intended shape is:

```text
BetaRawMessageStreamEvent
  -> transformer branch with type narrowing
  -> ClaudeCodeUIMessageChunk
```

Not:

```text
BetaRawMessageStreamEvent
  -> custom ParsedStreamEvent
  -> custom ParsedTextBlock
  -> ClaudeCodeUIMessageChunk
```

### 5.6 Text Test Checklist

At minimum, Phase 1 should add the following tests:

1. `message_start + text block start/delta/stop` emits a legal text chunk sequence
2. Multiple `text_delta` events append in order
3. Empty string delta does not emit a chunk
4. Delta without `text-start` is ignored
5. Repeated delta after block stop is ignored
6. Once the same `message.id` has been emitted through `stream_event`, the later full `assistant` branch does not emit it again

## 6. Thinking Design

`thinking` is a Phase 2 feature. Its structure is intentionally parallel to `text`.

### 6.1 Target Mapping

- `content_block_start(thinking)` -> `reasoning-start`
- `content_block_delta(thinking_delta)` -> `reasoning-delta`
- `content_block_stop(thinking)` -> `reasoning-end`

### 6.2 Design Principles

1. Continue using `${kind}:${messageId}:${index}` as the part id
2. Continue using `activeThinkingBlocks` to enforce legal ordering
3. Keep `signature_delta`, `redacted_thinking`, and similar special cases out of Phase 1

### 6.3 Risk Areas

- Thinking blocks may interleave with text blocks
- Thinking deltas do not use the `text` field. They use the provider-specific `thinking` field
- Supporting signature validation would need extra state and is out of scope for the text-first phase

## 7. Toolcall Design

`toolcall` is a Phase 3 feature and is more complex than `text` or `thinking`.

### 7.1 Target Mapping

The recommended mapping is the same one used by the AI SDK tool input state machine:

- `content_block_start(tool_use)` -> `tool-input-start`
- `content_block_delta(input_json_delta)` -> `tool-input-delta`
- `content_block_stop(tool_use)` -> `tool-input-available`

### 7.2 Additional State

Toolcall support needs extra state:

- `toolCallId`
- `toolName`
- incremental JSON buffer
- parsed JSON result at stop time

Even here, avoid introducing new shared public types. If helper state is needed, keep it private to `sdk-message-transformer.ts`.

### 7.3 Risk Areas

1. `input_json_delta` is a string delta and is not guaranteed to be valid JSON at each step
2. Full parsing is only appropriate at stop time
3. If parsing fails at stop time, we still need to choose whether to emit `tool-input-error` or ignore the tool block

Because of that, toolcall should not be bundled into the text phase.

## 8. Phased Implementation Plan

### Phase 1: Text

Goal:

- Fully enable streamed text rendering from `stream_event`
- Keep the existing `result` finish behavior unchanged

Files:

- `sdk-message-transformer.ts`
- `sdk-message-transformer.test.ts`

### Phase 2: Thinking

Goal:

- Reuse the same state machine pattern from text and extend it to `reasoning-*`

### Phase 3: Toolcall

Goal:

- Add JSON buffering and stop-time parsing
- Enable true streaming display for tool input as well

## 9. Final Recommendation

This design recommends implementing `text` first for three reasons:

1. It is the most visible part of the streaming user experience
2. Its chunk validity rules are the clearest, which makes it the best place to stabilize the state machine
3. `thinking` and `toolcall` can both be added later using the same pattern once the text state machine is proven stable

After Phase 1 lands, `SDKMessageTransformer` in this repository will support all of the following at the same time:

- full `assistant` message replay
- incremental `stream_event` text rendering
- the existing `result`-driven finish flow

That is the smallest, safest, and easiest-to-verify starting point.
