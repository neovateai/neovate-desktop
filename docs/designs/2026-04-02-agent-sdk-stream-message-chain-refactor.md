# Agent SDK Stream & Message Chain Refactor

## 1. Overview

Refactor the Claude Agent SDK message flow architecture from the current "dual-channel + per-turn stream" model to a "single-channel subscribe + fire-and-forget send" model. This resolves two core issues: background bash events being lost, and the inability to send messages during streaming.

### Current Architecture ([2026-03-08 Design](./2026-03-08-agent-chat-transport-design-detail.md))

```
Channel 1: stream    — per-turn, carries UIMessageChunks, closes on result
Channel 2: subscribe — long-lived connection, carries side events (permission, context_usage)
```

### Target Architecture

```
Channel 1: subscribe — long-lived connection, carries all events (chunk + event + turn signals)
RPC: send            — fire-and-forget, pushes messages to Pushable
```

## 2. Problems

### 2.1 Background Bash Events Lost

When Claude Code executes background bash tasks (e.g., `sleep 60 &`), the SDK event sequence is:

```
assistant           ← Claude writes bash command
result/success      ← main turn completes ← current stream() breaks here
task_notification   ← background bash output (after result!)
init                ← SDK auto-handles background output
assistant           ← Claude responds to background output
result/success      ← background turn completes
idle                ← everything done
```

The `if (value.type === "result") break` at `session-manager.ts:904` causes `task_notification` and all subsequent events to be lost. Users never see background task output.

ACP has the same issue: [agentclientprotocol/claude-agent-acp#446](https://github.com/agentclientprotocol/claude-agent-acp/issues/446)

### 2.2 Cannot Send Messages During Streaming

`AbstractChat.makeRequest` consumes the stream -> stream closes -> `setStatus("ready")` -> user can send next message. If the stream doesn't close, the user is blocked.

### 2.3 Per-Turn Stream vs Long-Lived Generator Mismatch

When SDK's `query()` uses a `Pushable<SDKUserMessage>` as the prompt, the returned AsyncGenerator **never yields `done: true` between turns**. Currently each `stream()` call creates a `while(true) { query.next() }` loop that breaks on result, but the underlying generator lives across turns.

## 3. Playground Validation Results

Validated in `claude-agent-sdk-message-playground` (SDK 0.2.90):

### 3.1 AsyncGenerator Behavior

- When using `Pushable<SDKUserMessage>` as prompt, `query()` returns an AsyncGenerator that **never returns `done: true` between turns**
- The generator stays alive, waiting for the next push
- `done: true` only occurs when `Pushable.end()` is called or the SDK subprocess exits
- Multi-turn conversations are achieved by pushing new messages — no need to rebuild the query

### 3.2 `session_state_changed` Events

Requires environment variable `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS=1`:

| SDK Version | Behavior                                     |
| ----------- | -------------------------------------------- |
| 0.2.71      | Does not emit `session_state_changed` events |
| 0.2.90      | Correctly emits `running` / `idle` events    |

### 3.3 Turn Boundaries

`system/init` and `result` form natural turn boundaries, including turns triggered by background tasks:

```
seq=2   session_state_changed: running
seq=3   init          ← turn 1 (user message)
seq=11  assistant
seq=17  result        ← turn 1 ends

seq=18  task_notification  ← background bash output
seq=19  init          ← turn 2 (SDK auto-handles background)
seq=20  assistant
seq=21  result        ← turn 2 ends

seq=22  session_state_changed: idle  ← everything done
```

## 4. Solution

### 4.1 Design Principles

- **Minimal changes**: Server still emits `ClaudeCodeUIMessageChunk` (`SDKMessageTransformer` unchanged), client is responsible for assembling chunks into `UIMessage[]`
- **Preserve AbstractChat**: `ClaudeCodeChat` still extends `AbstractChat`, overrides `sendMessage` as fire-and-forget while maintaining type compatibility
- **Separation of concerns**: Chunk-to-UIMessage assembly logic extracted into a standalone `ChunkProcessor`, updates messages through the `ChatState` interface so timing logic works automatically
- Keep UI layer interface unchanged (`sendMessage`, `messages`, `status`, hooks)

### 4.2 Renderer Class Responsibilities

```
ClaudeCodeChat extends AbstractChat<ClaudeCodeUIMessage>
  ├── override sendMessage  → state.pushMessage(userMsg) + rpc.send()
  ├── override stop         → dispatch({ kind: "interrupt" })
  ├── subscribe handler     → dispatches turn_start/turn_end/chunk/event
  └── delegates to ChunkProcessor

ChunkProcessor (new, separate file)
  ├── holds ChatState reference
  ├── processChunk(chunk)   → state.pushMessage() / state.replaceMessage()
  ├── resetTurn()           → clears assembly state
  └── manages assembly state (activeMessage, activeTextParts, activeReasoningParts, partialToolCalls)

ChatState (unchanged)
  ├── pushMessage()         → appends message + updates timing
  ├── replaceMessage()      → replaces message + updates thinking timing
  ├── status setter         → auto-manages turnStartedAt
  └── Zustand store         → consumed directly by React components
```

### 4.3 Data Flow

```
┌───────────────────────────────────────────────────────────────┐
│ Renderer                                                       │
│                                                                │
│  UI Components                                                 │
│    │ sendMessage(text)          ← interface unchanged          │
│    ▼                                                           │
│  ClaudeCodeChat (extends AbstractChat)                         │
│    │ 1. state.pushMessage(userMsg)                             │
│    │ 2. rpc.send(sessionId, message) ← fire & forget           │
│    │                                                           │
│    │ subscribe (long-lived, lifecycle = session lifecycle)      │
│    │ ◄────────────────────────────────────────────────────     │
│    │  chunk(start)  → resetTurn + status = "streaming"         │
│    │  chunk(*)      → chunkProcessor.processChunk(chunk)       │
│    │  chunk(finish) → status = "ready"                         │
│    │  event         → permissions / context_usage / etc        │
│    ▼                                                           │
│  ChunkProcessor → ChatState.pushMessage / replaceMessage       │
│    │                                                           │
│    ▼                                                           │
│  Zustand Store (messages, status, pendingRequests, timing...)  │
│    │                                                           │
│    ▼                                                           │
│  React Components (unchanged)                                  │
└───────────────────────────────────────────────────────────────┘
        │ rpc.send()            ▲ subscribe events
        ▼                       │
┌───────────────────────────────────────────────────────────────┐
│ Main Process                                                   │
│                                                                │
│  Router                                                        │
│    send      → sessionManager.send(sessionId, message)         │
│    subscribe → eventPublisher.subscribe(sessionId)             │
│                                                                │
│  SessionManager                                                │
│    send()     → push SDKUserMessage to Pushable                │
│    consume()  → background loop, all events → eventPublisher   │
│                                                                │
│    ┌───────────────────────────────────────┐                   │
│    │ consume(sessionId)                    │                   │
│    │   while (true) {                      │                   │
│    │     const { value, done } =           │                   │
│    │       await query.next()              │                   │
│    │     if (done) break                   │                   │
│    │                                       │                   │
│    │     transformer.transform(value)      │                   │
│    │       → publish chunks (emit as-is)   │                   │
│    │                                       │                   │
│    │     toUIEvent(value)                  │                   │
│    │       → publish events (emit as-is)   │                   │
│    │   }                                   │                   │
│    └───────────────────────────────────────┘                   │
│                                                                │
│  Pushable<SDKUserMessage>  ←── send() pushes here              │
│       │                                                        │
│       ▼                                                        │
│  query(AsyncIterable) ── long-lived generator                  │
└───────────────────────────────────────────────────────────────┘
```

### 4.4 Key Behaviors

| Scenario                      | Current Behavior                                   | Target Behavior                                                                   |
| ----------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| Single-turn conversation      | stream → result → break → ready                    | send → subscribe receives start chunk → streaming → finish chunk → ready          |
| Multi-turn conversation       | New stream created per turn                        | send pushes to same Pushable, subscribe receives continuously                     |
| Background bash               | Events lost after result                           | consume runs continuously, task_notification + background turn delivered normally |
| Send message during streaming | Blocked by AbstractChat                            | overridden sendMessage skips status check, pushes directly                        |
| Permission request            | subscribe pushes → UI dialog → dispatch sends back | Unchanged                                                                         |
| Interrupt                     | dispatch → query.interrupt()                       | Unchanged                                                                         |

## 5. File Changes

### 5.1 Type Changes

**`shared/claude-code/types.ts`**

Extend the `ClaudeCodeUIEvent` union type (only adding `chunk`):

```ts
export type ClaudeCodeUIEvent =
  | { kind: "event"; event: ClaudeCodeUIEventMessage }
  | { kind: "request"; requestId: string; request: ClaudeCodeUIEventRequest }
  | { kind: "request_settled"; requestId: string }
  | { kind: "chunk"; chunk: ClaudeCodeUIMessageChunk }; // new
```

No need for synthetic `turn_start`/`turn_end`. `SDKMessageTransformer` already emits a `{ type: "start" }` chunk on `system/init` and a `{ type: "finish" }` chunk on `result` — the client uses these native chunks to determine turn boundaries.

### 5.2 Server (Main Process)

#### `session-manager.ts`

**Delete** the `stream()` method (currently lines 775-909)

**Add** `send()` — extract message conversion + push logic from `stream()`, without consuming the iterator:

```ts
async send(sessionId: string, message: ClaudeCodeUIMessage) {
  const session = this.sessions.get(sessionId);
  if (!session) throw new Error(`Unknown session: ${sessionId}`);

  // UIMessage → SDKUserMessage conversion (moved from stream(), logic unchanged)
  const { content, imageBlocks } = extractMessageContent(message);

  const userMessageId = randomUUID();
  session.lastUserMessageId = userMessageId;

  // Pre-turn git snapshot (moved from stream())
  session.preTurnRef = await this.capturePreTurnRef(session.cwd);

  this.requestTracker.startTurn(sessionId);
  this.powerBlocker.onTurnStart(sessionId);

  session.input.push({
    type: "user",
    message: { role: "user", content },
    parent_tool_use_id: null,
    session_id: sessionId,
    uuid: userMessageId,
  });
}
```

**Add** `consume()` — started after session initialization, continuously consumes the query iterator, emitting all events through eventPublisher:

```ts
private async consume(sessionId: string) {
  const session = this.sessions.get(sessionId);
  if (!session) return;

  const transformer = new SDKMessageTransformer();
  let lastInputTokens = 0;

  try {
    while (true) {
      const { value, done } = await session.query.next();
      if (done || !value) break;

      // Context window tracking (moved from stream())
      if (
        value.type === "stream_event" &&
        value.event.type === "message_start" &&
        value.parent_tool_use_id === null
      ) {
        const usage = value.event.message.usage;
        if (usage) {
          lastInputTokens =
            (usage.input_tokens ?? 0) +
            (usage.cache_creation_input_tokens ?? 0) +
            (usage.cache_read_input_tokens ?? 0);
        }
      }

      // Side events (permission, status, task_notification, etc.) — emit as-is
      const event = toUIEvent(value);
      if (event) {
        this.eventPublisher.publish(sessionId, event);
      }

      // Message chunks — publish whatever SDKMessageTransformer produces
      for await (const chunk of transformer.transformWithAggregation(value)) {
        this.eventPublisher.publish(sessionId, { kind: "chunk", chunk });
      }

      // Result → context_usage + power blocker release
      if (value.type === "result") {
        const modelEntries = Object.values(value.modelUsage ?? {});
        const contextWindowSize = modelEntries[0]?.contextWindow ?? 0;
        const remainingPct = contextWindowSize > 0
          ? Math.max(0, Math.min(100, Math.round((1 - lastInputTokens / contextWindowSize) * 100)))
          : 0;
        this.eventPublisher.publish(sessionId, {
          kind: "event",
          event: {
            id: randomUUID(),
            type: "context_usage",
            contextWindowSize,
            usedTokens: lastInputTokens,
            remainingPct,
          },
        });

        this.powerBlocker.onTurnEnd(sessionId);
      }
    }
  } catch (err: any) {
    this.eventPublisher.publish(sessionId, {
      kind: "chunk",
      chunk: { type: "error", errorText: err.message },
    });
  } finally {
    this.powerBlocker.onTurnEnd(sessionId);
  }
}
```

**Modify** `initSession()` — start consume after initialization + add environment variable:

```ts
// Add to env
CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1";

// After sessions.set() and initializationResult()
const initResult = await q.initializationResult();
this.consume(sessionId); // fire and forget, lifecycle = session lifecycle
return initResult;
```

#### `router.ts`

```diff
- stream: os.agent.claudeCode.stream.handler(async function* ({ input, context }) {
-   for await (const chunk of context.sessionManager.stream(input.sessionId, input.message)) {
-     yield chunk;
-   }
- }),
+ send: os.agent.claudeCode.send.handler(async ({ input, context }) => {
+   await context.sessionManager.send(input.sessionId, input.message);
+ }),
```

Subscribe handler unchanged.

#### `contract.ts`

```diff
- stream: oc
-   .input(type<{ sessionId: string; message: ClaudeCodeUIMessage }>())
-   .output(eventIterator(type<ClaudeCodeUIMessageChunk>())),
+ send: oc
+   .input(type<{ sessionId: string; message: ClaudeCodeUIMessage }>())
+   .output(type<void>()),
```

### 5.3 Renderer

#### `chunk-processor.ts` — New File

Standalone file responsible for assembling `ClaudeCodeUIMessageChunk` into `UIMessage[]`. Updates messages through the `ChatState` interface so timing logic works automatically.

**Key constraint**: The `processChunk` switch logic **strictly mirrors** AI SDK's internal `processUIMessageStream` (`ai/dist/index.js` around lines 5245-5752), maintaining the same state machine behavior case-by-case. Unit tests ensure both produce identical `UIMessage[]` output for the same chunk sequences (see Section 7).

```ts
import type {
  ClaudeCodeUIMessage,
  ClaudeCodeUIMessageChunk,
} from "../../../../shared/claude-code/types";
import type { ClaudeCodeChatState } from "./chat-state";

export class ChunkProcessor {
  private activeMessage: ClaudeCodeUIMessage | null = null;
  private activeMessageIndex = -1;
  private activeTextParts = new Map<string, number>();
  private activeReasoningParts = new Map<string, number>();
  private partialToolCalls = new Map<string, { partIndex: number; inputText: string }>();

  constructor(private state: ClaudeCodeChatState) {}

  resetTurn() {
    this.activeMessage = null;
    this.activeMessageIndex = -1;
    this.activeTextParts.clear();
    this.activeReasoningParts.clear();
    this.partialToolCalls.clear();
  }

  processChunk(chunk: ClaudeCodeUIMessageChunk) {
    const c = chunk as any;

    switch (chunk.type) {
      case "start":
        this.activeMessage = {
          id: c.messageId,
          role: "assistant",
          parts: [],
          metadata: c.messageMetadata,
        } as ClaudeCodeUIMessage;
        this.state.pushMessage(this.activeMessage);
        this.activeMessageIndex = this.state.messages.length - 1;
        break;

      case "text-start": {
        if (!this.activeMessage) break;
        const partIndex = this.activeMessage.parts.length;
        this.activeMessage.parts.push({ type: "text", text: "" } as any);
        this.activeTextParts.set(c.id, partIndex);
        this.flush();
        break;
      }

      case "text-delta": {
        const idx = this.activeTextParts.get(c.id);
        if (idx === undefined || !this.activeMessage) break;
        const part = this.activeMessage.parts[idx] as any;
        if (part?.type === "text") part.text += c.delta;
        this.flush();
        break;
      }

      case "text-end":
        this.activeTextParts.delete(c.id);
        this.flush();
        break;

      case "reasoning-start": {
        if (!this.activeMessage) break;
        const partIndex = this.activeMessage.parts.length;
        this.activeMessage.parts.push({
          type: "reasoning",
          reasoning: "",
          providerMetadata: c.providerMetadata,
        } as any);
        this.activeReasoningParts.set(c.id, partIndex);
        this.flush();
        break;
      }

      case "reasoning-delta": {
        const idx = this.activeReasoningParts.get(c.id);
        if (idx === undefined || !this.activeMessage) break;
        const part = this.activeMessage.parts[idx] as any;
        if (part?.type === "reasoning") {
          part.reasoning += c.delta;
          // Preserve signature metadata (SDKMessageTransformer may include it in reasoning-delta)
          if (c.providerMetadata) part.providerMetadata = c.providerMetadata;
        }
        this.flush();
        break;
      }

      case "reasoning-end":
        this.activeReasoningParts.delete(c.id);
        this.flush();
        break;

      case "tool-input-start": {
        if (!this.activeMessage) break;
        const partIndex = this.activeMessage.parts.length;
        this.activeMessage.parts.push({
          type: "tool-invocation",
          toolInvocation: {
            toolCallId: c.toolCallId,
            toolName: c.toolName,
            state: "partial-call",
            args: {},
          },
        } as any);
        this.partialToolCalls.set(c.toolCallId, { partIndex, inputText: "" });
        this.flush();
        break;
      }

      case "tool-input-delta": {
        const tc = this.partialToolCalls.get(c.toolCallId);
        if (!tc || !this.activeMessage) break;
        tc.inputText += c.inputTextDelta;
        try {
          const part = this.activeMessage.parts[tc.partIndex] as any;
          if (part?.type === "tool-invocation") {
            part.toolInvocation.args = JSON.parse(tc.inputText);
          }
        } catch {
          /* partial JSON */
        }
        this.flush();
        break;
      }

      case "tool-input-available": {
        if (!this.activeMessage) break;
        // Key fix: SDKMessageTransformer.transformAssistant() emits tool-input-available
        // directly for non-streaming assistant messages, without a preceding tool-input-start.
        // Must handle the case where partialToolCalls has no entry.
        let tc = this.partialToolCalls.get(c.toolCallId);
        if (!tc) {
          // First appearance (non-streaming path) — create tool part and mark as call directly
          const partIndex = this.activeMessage.parts.length;
          this.activeMessage.parts.push({
            type: "tool-invocation",
            toolInvocation: {
              toolCallId: c.toolCallId,
              toolName: c.toolName,
              state: "call",
              args: c.input,
            },
          } as any);
          this.partialToolCalls.set(c.toolCallId, { partIndex, inputText: "" });
        } else {
          // Streaming path — update existing partial tool
          const part = this.activeMessage.parts[tc.partIndex] as any;
          if (part?.type === "tool-invocation") {
            part.toolInvocation = { ...part.toolInvocation, state: "call", args: c.input };
          }
        }
        this.flush();
        break;
      }

      case "tool-output-available": {
        if (!this.activeMessage) break;
        const tc = this.partialToolCalls.get(c.toolCallId);
        if (!tc) break;
        const part = this.activeMessage.parts[tc.partIndex] as any;
        if (part?.type === "tool-invocation") {
          // preliminary: true indicates intermediate output from sub-Agent/Task, not marked as final result
          if (c.preliminary) {
            part.toolInvocation = { ...part.toolInvocation, result: c.output };
            // Keep state unchanged (don't set to "result"), indicating tool is still executing
          } else {
            part.toolInvocation = { ...part.toolInvocation, state: "result", result: c.output };
            this.partialToolCalls.delete(c.toolCallId);
          }
        }
        this.flush();
        break;
      }

      case "tool-input-error":
      case "tool-output-error": {
        const tc = this.partialToolCalls.get(c.toolCallId);
        if (!tc || !this.activeMessage) break;
        const part = this.activeMessage.parts[tc.partIndex] as any;
        if (part?.type === "tool-invocation") {
          part.toolInvocation = {
            ...part.toolInvocation,
            state: "result",
            result: { error: c.errorText },
          };
        }
        this.partialToolCalls.delete(c.toolCallId);
        this.flush();
        break;
      }

      case "error":
        this.state.error = new Error(c.errorText);
        this.state.status = "error";
        break;

      case "start-step":
      case "finish-step":
      case "finish":
        break;

      default:
        // data-* parts (system/init, result/success, result/error, system/compact_boundary)
        if (chunk.type.startsWith("data-")) {
          if (!this.activeMessage) break;
          this.activeMessage.parts.push({
            type: "data",
            dataType: chunk.type.replace("data-", ""),
            data: c.data,
          } as any);
          this.flush();
        }
        break;
    }
  }

  /** Update the active message via ChatState.replaceMessage, triggering timing logic */
  private flush() {
    if (!this.activeMessage || this.activeMessageIndex < 0) return;
    this.state.replaceMessage(this.activeMessageIndex, this.activeMessage);
  }
}
```

#### `chat.ts` — Minimal Changes (still extends AbstractChat)

```ts
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { ChatInit } from "ai";

import { consumeEventIterator } from "@orpc/client";
import { AbstractChat } from "ai";

import type {
  ClaudeCodeUIDispatch,
  ClaudeCodeUIEvent,
  ClaudeCodeUIEventMessage,
  ClaudeCodeUIMessage,
} from "../../../../shared/claude-code/types";
import type { ClaudeCodeChatTransport } from "./chat-transport";

import { ClaudeCodeChatState, ClaudeCodeChatStoreState } from "./chat-state";
import { ChunkProcessor } from "./chunk-processor";
import { useAgentStore } from "./store";

export interface ClaudeCodeChatInit extends Omit<ChatInit<ClaudeCodeUIMessage>, "transport"> {
  id: string;
  transport: ClaudeCodeChatTransport;
  onTurnComplete?: (sessionId: string, result: "success" | "error") => void;
  onTurnStart?: (sessionId: string) => void;
}

export class ClaudeCodeChat extends AbstractChat<ClaudeCodeUIMessage> {
  readonly store: StoreApi<ClaudeCodeChatStoreState>;
  readonly #transport: ClaudeCodeChatTransport;
  readonly #state: ClaudeCodeChatState;
  readonly #chunkProcessor: ChunkProcessor;

  #unsubscribe?: () => Promise<void>;
  #unsubscribeStore?: () => void;

  constructor({
    id,
    messages,
    transport,
    onTurnComplete,
    onTurnStart,
    ...init
  }: ClaudeCodeChatInit) {
    const state = new ClaudeCodeChatState(messages);
    super({
      id,
      transport, // AbstractChat requires transport, but sendMessages won't be called
      state,
      ...init,
    });

    this.store = state.store;
    this.#transport = transport;
    this.#state = state;
    this.#chunkProcessor = new ChunkProcessor(state);

    // Single long-lived connection
    this.#unsubscribe = consumeEventIterator(transport.subscribe({ chatId: id }), {
      onEvent: (event) => this.#handleEvent(event),
      onError: (error) => this.store.setState({ eventError: error }),
    });

    // Status change callbacks (consistent with existing logic)
    if (onTurnComplete || onTurnStart) {
      let prev = this.store.getState().status;
      this.#unsubscribeStore = this.store.subscribe((cur) => {
        const status = cur.status;
        if (status === prev) return;

        if (status === "submitted" || status === "streaming") {
          if (cur.promptSuggestion !== null) {
            this.store.setState({ promptSuggestion: null });
          }
          onTurnStart?.(id);
        } else if (
          (prev === "streaming" && (status === "ready" || status === "error")) ||
          (prev === "submitted" && status === "error")
        ) {
          onTurnComplete?.(id, status === "ready" ? "success" : "error");
        }

        prev = status;
      });
    }
  }

  // ── Override sendMessage — fire & forget ───────────────────

  override sendMessage = async (opts: any) => {
    // Build user message (reuses AbstractChat's generateId)
    const text = typeof opts === "string" ? opts : (opts?.text ?? "");
    const metadata = opts?.metadata ?? { sessionId: this.id, parentToolUseId: null };

    const userMessage: ClaudeCodeUIMessage = {
      id: this.generateId(),
      role: "user",
      parts: [
        ...(text ? [{ type: "text" as const, text }] : []),
        // file/image parts assembled by caller
        ...(opts?.parts ?? []),
      ],
      metadata,
    } as ClaudeCodeUIMessage;

    // Push through ChatState interface (triggers timing logic)
    this.#state.pushMessage(userMessage);
    this.#state.status = "submitted";

    // Fire and forget — subscribe handles the rest
    try {
      await this.#transport.send(this.id, userMessage);
    } catch (err: any) {
      // Send failed → rollback: remove optimistically added user message, restore status
      this.#state.popMessage();
      this.#state.status = "ready";
      this.#state.error = err instanceof Error ? err : new Error(String(err));
    }
  };

  // ── Override stop — dispatch interrupt ─────────────────────

  override stop = async () => {
    await this.dispatch({ kind: "interrupt" });
    this.store.setState({ pendingRequests: [] });
  };

  // ── Event handling (subscribe channel) ─────────────────────

  #handleEvent(event: ClaudeCodeUIEvent) {
    switch (event.kind) {
      case "chunk":
        // Turn boundaries driven by SDKMessageTransformer native chunks:
        // "start" chunk (emitted on system/init) → streaming
        // "finish" chunk (emitted on result) → ready
        if (event.chunk.type === "start") {
          this.#chunkProcessor.resetTurn();
          this.#state.status = "streaming";
        }
        this.#chunkProcessor.processChunk(event.chunk);
        if (event.chunk.type === "finish") {
          this.#state.status = "ready";
        }
        break;

      case "request":
        this.store.setState((s) => ({
          pendingRequests: s.pendingRequests.some((r) => r.requestId === event.requestId)
            ? s.pendingRequests
            : s.pendingRequests.concat({ requestId: event.requestId, request: event.request }),
        }));
        break;

      case "request_settled":
        this.store.setState((s) => ({
          pendingRequests: s.pendingRequests.filter((r) => r.requestId !== event.requestId),
        }));
        break;

      case "event":
        this.#handleSideEvent(event.event);
        break;
    }
  }

  #handleSideEvent(event: ClaudeCodeUIEventMessage) {
    // Consistent with existing logic
    if (event.type === "context_usage") {
      const { contextWindowSize, usedTokens, remainingPct } = event as any;
      useAgentStore.getState().setSessionUsage(this.id, {
        contextWindowSize,
        usedTokens,
        remainingPct,
      });
    } else if (event.type === "prompt_suggestion") {
      this.store.setState({ promptSuggestion: (event as any).suggestion });
    }
  }

  // ── Methods unchanged ─────────────────────────────────────

  respondToRequest = async (
    requestId: string,
    respond: { type: "permission_request"; result: PermissionResult },
  ) => {
    // Identical to existing chat.ts
    if (respond.type === "permission_request") {
      const request = this.store.getState().pendingRequests.find((r) => r.requestId === requestId);

      const result = await this.dispatch({
        kind: "respond",
        requestId,
        respond: {
          type: "permission_request",
          result: { ...respond.result, toolUseID: request?.request.options.toolUseID },
        },
      });

      if (result.kind === "respond") {
        this.store.setState((s) => ({
          pendingRequests: s.pendingRequests.filter((r) => r.requestId !== requestId),
        }));
      }
    }
  };

  dispatch = (dispatch: ClaudeCodeUIDispatch) => {
    return this.#transport.dispatch({ chatId: this.id, dispatch });
  };

  interrupt = async () => {
    await this.dispatch({ kind: "interrupt" });
    this.store.setState({ pendingRequests: [] });
  };

  dispose = async () => {
    this.#unsubscribeStore?.();
    await this.#unsubscribe?.();
  };
}
```

#### `chat-transport.ts` — Minimal Changes

Only replace `sendMessages` with `send`, everything else unchanged:

```diff
- async sendMessages(options: { ... }) {
-   return eventIteratorToUnproxiedDataStream(
-     await this.rpc.claudeCode.stream(
-       { sessionId: options.chatId, message: lastMessage },
-       { signal: options.abortSignal },
-     ),
-   );
- }
+ async send(sessionId: string, message: ClaudeCodeUIMessage) {
+   await this.rpc.claudeCode.send({ sessionId, message });
+ }
```

`subscribe()` and `dispatch()` unchanged.

#### `chat-state.ts` — Unchanged

`pushMessage`, `replaceMessage`, and the `status` setter's timing logic are automatically triggered by `ChunkProcessor` and `ClaudeCodeChat`.

#### `chat-manager.ts` — Unchanged

The way `ClaudeCodeChat` is constructed remains the same (still receives `transport`).

#### UI Components — Unchanged

- `useClaudeCodeChat` hook reads from the same store
- `agent-chat.tsx` calls the same `sendMessage` interface
- `MessageParts` renders the same `ClaudeCodeUIMessage` structure
- `status` values unchanged (`"ready"` / `"streaming"` / `"submitted"` / `"error"`)

## 6. Test Strategy: ChunkProcessor vs processUIMessageStream Consistency

### 6.1 Core Guarantee

`ChunkProcessor` is an equivalent implementation of AI SDK's `processUIMessageStream`. Unit tests ensure: **identical chunk sequence input → both produce identical `UIMessage[]` output**.

### 6.2 Test Approach

```ts
// chunk-processor.test.ts

import { ChunkProcessor } from "./chunk-processor";
import { ClaudeCodeChatState } from "./chat-state";

/**
 * Reference implementation: use AI SDK's processUIMessageStream to consume
 * the same chunk sequence, producing UIMessages as expected output.
 */
function processWithAiSdk(chunks: ClaudeCodeUIMessageChunk[]): ClaudeCodeUIMessage[] {
  // Build ReadableStream, feed to processUIMessageStream
  const stream = new ReadableStream<ClaudeCodeUIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });

  // processUIMessageStream + createStreamingUIMessageState
  // Note: these two functions are not exported from the ai package, need to extract from dist or mock
  // Alternative: use AbstractChat internally consuming a mock transport's returned stream
  const state = createStreamingUIMessageState();
  await consumeStream(processUIMessageStream({ stream, state, ... }));
  return [state.message];
}

/**
 * Our implementation: using ChunkProcessor
 */
function processWithChunkProcessor(chunks: ClaudeCodeUIMessageChunk[]): ClaudeCodeUIMessage[] {
  const chatState = new ClaudeCodeChatState();
  const processor = new ChunkProcessor(chatState);
  for (const chunk of chunks) {
    processor.processChunk(chunk);
  }
  return chatState.messages;
}

// ── Fixture List ──────────────────────────────────────────────

const FIXTURES = {
  "single turn plain text": [
    { type: "start", messageId: "msg-1" },
    { type: "text-start", id: "t-1" },
    { type: "text-delta", id: "t-1", delta: "Hello " },
    { type: "text-delta", id: "t-1", delta: "world" },
    { type: "text-end", id: "t-1" },
    { type: "finish-step" },
    { type: "finish" },
  ],

  "streaming tool call": [
    { type: "start", messageId: "msg-1" },
    { type: "tool-input-start", toolCallId: "tc-1", toolName: "Bash" },
    { type: "tool-input-delta", toolCallId: "tc-1", inputTextDelta: '{"com' },
    { type: "tool-input-delta", toolCallId: "tc-1", inputTextDelta: 'mand":"ls"}' },
    { type: "tool-input-available", toolCallId: "tc-1", toolName: "Bash", input: { command: "ls" } },
    { type: "tool-output-available", toolCallId: "tc-1", output: "file.txt" },
    { type: "finish-step" },
    { type: "finish" },
  ],

  "non-streaming assistant (tool-input-available without start)": [
    { type: "start", messageId: "msg-1" },
    { type: "tool-input-available", toolCallId: "tc-1", toolName: "Read", input: { file: "a.ts" } },
    { type: "tool-output-available", toolCallId: "tc-1", output: "content" },
    { type: "finish-step" },
    { type: "finish" },
  ],

  "reasoning + text": [
    { type: "start", messageId: "msg-1" },
    { type: "reasoning-start", id: "r-1", providerMetadata: { anthropic: { signature: "sig" } } },
    { type: "reasoning-delta", id: "r-1", delta: "thinking..." },
    { type: "reasoning-end", id: "r-1" },
    { type: "text-start", id: "t-1" },
    { type: "text-delta", id: "t-1", delta: "answer" },
    { type: "text-end", id: "t-1" },
    { type: "finish-step" },
    { type: "finish" },
  ],

  "preliminary tool output (sub-Agent)": [
    { type: "start", messageId: "msg-1" },
    { type: "tool-input-available", toolCallId: "tc-1", toolName: "Agent", input: { prompt: "do X" } },
    { type: "tool-output-available", toolCallId: "tc-1", output: "partial...", preliminary: true },
    { type: "tool-output-available", toolCallId: "tc-1", output: "final result", preliminary: false },
    { type: "finish-step" },
    { type: "finish" },
  ],

  "error": [
    { type: "start", messageId: "msg-1" },
    { type: "error", errorText: "something failed" },
  ],

  "data parts": [
    { type: "start", messageId: "msg-1" },
    { type: "data-system/init", data: { session_id: "s-1" } },
    { type: "data-result/success", data: { result: "ok" } },
    { type: "finish" },
  ],
};

// ── Tests ──────────────────────────────────────────────────────

describe("ChunkProcessor vs processUIMessageStream", () => {
  for (const [name, chunks] of Object.entries(FIXTURES)) {
    it(`${name}: output matches`, () => {
      const expected = processWithAiSdk(chunks);
      const actual = processWithChunkProcessor(chunks);

      // Compare message structure (ignoring timing and other store-appended fields)
      expect(actual.map(stripTiming)).toEqual(expected.map(stripTiming));
    });
  }
});
```

### 6.3 Fixture Sources

| Source                  | Purpose                                                                                                          |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Hand-crafted (as above) | Cover every chunk type code path                                                                                 |
| Playground recordings   | Real SDK event sequences, post-`SDKMessageTransformer` chunk output                                              |
| Snapshot tests          | Record `processUIMessageStream` output once in CI as golden file, compare against `ChunkProcessor` going forward |

### 6.4 Handling Non-Exported processUIMessageStream

`processUIMessageStream` and `createStreamingUIMessageState` are not exported from the `ai` package. Two approaches to obtain the reference implementation:

1. **Mock transport approach**: Construct an `AbstractChat` instance with a mock transport that returns a chunk stream, let AI SDK run the full internal pipeline, read results from `ChatState.messages`
2. **Extraction approach**: Extract these two functions from `ai/dist/index.js` into a test helper (~500 lines, test-only)

Approach 1 is recommended as it doesn't depend on internal implementation details.

## 7. Migration Checklist

### Server

- [ ] `session-manager.ts`: Add `CLAUDE_CODE_EMIT_SESSION_STATE_EVENTS: "1"` to env
- [ ] `session-manager.ts`: Add `send()` method (extract message conversion + push logic from `stream()`)
- [ ] `session-manager.ts`: Add `consume()` method (with finally cleanup), start it in `initSession()`
- [ ] `session-manager.ts`: Delete `stream()` method
- [ ] `contract.ts`: `stream` → `send`
- [ ] `router.ts`: `stream` handler → `send` handler

### Shared

- [ ] `shared/claude-code/types.ts`: Extend `ClaudeCodeUIEvent` with `chunk`

### Renderer

- [ ] Add `chunk-processor.ts`
- [ ] `chat.ts`: Override `sendMessage` (fire & forget + failure rollback) and `stop`
- [ ] `chat.ts`: `#handleEvent` handles `chunk` (start → streaming, finish → ready)
- [ ] `chat-transport.ts`: `sendMessages` → `send`
- [ ] Verify `chat-manager.ts` construction unchanged
- [ ] Verify `useClaudeCodeChat` hook works correctly
- [ ] Verify `sendMessage` call sites unchanged

### Testing

- [ ] Single-turn conversation
- [ ] Multi-turn conversation
- [ ] Background bash + simultaneous user message sending
- [ ] Permission request during streaming
- [ ] Interrupt during streaming
- [ ] Session resume / load
- [ ] Image message sending
- [ ] `sendMessage` failure rollback

## 8. Risks and Mitigations

| Risk                                                        | Mitigation                                                                                   |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `ChunkProcessor` logic drifts from AI SDK updates           | Only handles chunk types actually emitted by `SDKMessageTransformer`, clear boundaries       |
| Background turn events interleave with user turn events     | Each `turn_start` calls `resetTurn()`; messages appended in order                            |
| `sendMessage` during streaming — server is in consume       | Pushable natively supports this; messages queue up, SDK processes in order                   |
| `eventPublisher` backpressure — high-throughput chunks      | oRPC EventPublisher already has buffering; same mechanism as current subscribe channel       |
| Event loss after disconnect/reconnect                       | Same risk as current subscribe channel; not in scope for this refactor                       |
| `consume()` exception leaks power blocker                   | finally block guarantees release                                                             |
| `sendMessage` failure leaves stale state in store           | catch block calls popMessage + restores status                                               |
| `tool-input-available` without preceding `tool-input-start` | `ChunkProcessor` handles first-appearance case, creates tool part and marks as call directly |
| Preliminary tool output treated as final                    | `ChunkProcessor` checks `preliminary` flag, doesn't set state to result                      |
