# Request Observability Panel

**Date:** 2026-03-17
**Status:** Draft

## Summary

Add a dev observability panel to Neovate Desktop that shows every HTTP request Claude Code makes to the Anthropic API in real-time. Inspired by cc-viewer's interceptor architecture, adapted to work within the Electron + Agent SDK subprocess model.

## Motivation

The Agent SDK exposes aggregated usage data (total cost, tokens per turn) but not individual HTTP requests. Developers need visibility into:

- Per-request latency and token breakdown
- Retry behavior and error responses
- What system prompt / tools / messages are sent in each request
- Sub-agent vs main-agent request classification
- Streaming vs non-streaming request mix
- Full request/response bodies for debugging
- Context window utilization approaching limits

## Architecture

### Data Flow

```
CLI subprocess (bun --preload fetch-interceptor.js cli.js)
|
|  globalThis.fetch monkey-patched
|  |-- Before fetch: emitSync "start" (summary only, ~1-5KB)
|  |-- After fetch: emitAsync "end" (summary + full request & response bodies)
|  |-- For streams: per-request StreamAssembler accumulates chunks
|  |-- Request body forwarded as raw string (zero-copy, no re-serialize)
|
|  fd 3: __NV_REQ:<json>\n  (single message type, dedicated IPC pipe)
|        __NV_READY\n       (handshake on init)
|  stdout: unchanged (SDK protocol)
|  stderr: unchanged (debug/error output)
|
v
spawnClaudeCodeProcess (session-manager.ts)
|
|  Custom spawn wrapper (only when networkInspector enabled):
|  |-- Inserts --preload before script path in bun args
|  |-- Sets NV_SESSION_ID env var
|  |-- Opens fd 3 as dedicated IPC pipe
|  |-- Waits for __NV_READY handshake (5s timeout, warns on failure)
|  |-- Reads fd 3: parse __NV_REQ lines -> RequestTracker
|  |-- stdout/stderr: untouched, forwarded to SDK as normal
|
v
RequestTracker (new service, main process)
|
|  In-memory store with dual cap (500 entries OR 50MB body size)
|  |-- Splits incoming messages: summary fields -> list, detail -> bodies Map
|  |-- Correlates requests to turns via SessionManager
|  |-- Tracks per-session inspector state (enabled / failed / not enabled)
|  |-- Exposes oRPC: listRequests, getRequestDetail, subscribeRequests
|  |-- EventPublisher for real-time push to renderer
|
v
Renderer (oRPC client)
|
|  "Network" plugin (content panel)
|  |-- Zustand store merges start/end phases into unified request rows
|  |-- Request list grouped by turn (left)
|  |-- Request detail with context utilization (right)
|  |-- Copy as cURL / Copy as JSON actions
|  |-- Session-aware: switches data on active session change
```

### Injection Mechanism

The interceptor runs inside the CLI subprocess via `bun --preload`. This is the cleanest injection point because:

- Bun natively supports `--preload` (runs before the main script)
- No changes to the ENV_BLOCKLIST (NODE_OPTIONS stays blocked)
- The interceptor patches `globalThis.fetch` before the Anthropic SDK initializes
- Zero interference with the SDK's stdout protocol

The `spawnClaudeCodeProcess` option in the Agent SDK lets us customize how the CLI process is spawned. We insert `--preload` into the args array.

**Arg ordering:** The SDK constructs args as `[cliPath, ...sdkFlags]`. Bun reads runtime flags (`--preload`) before the script argument, so `--preload` must be inserted before the script path:

```ts
// spawnOpts.args = ["/path/to/cli.js", "--sdk-flag1", ...]
// bun --preload interceptor.js /path/to/cli.js --sdk-flag1 ...
const child = spawn(spawnOpts.command, [
  "--preload",
  interceptorPath,
  ...spawnOpts.args, // cli.js comes first, bun sees --preload before it
]);
```

This ordering was verified experimentally — bun parses `--preload` as a runtime flag regardless of position before the script path.

### IPC Channel: File Descriptor 3

The `SpawnedProcess` interface only exposes `stdin` and `stdout`. The SDK accesses `.stderr` directly on the returned ChildProcess via duck-typing and forwards it to the `stderr` callback. Using stderr for interceptor IPC would require fragile line buffering and prefix filtering, risking interference with the SDK's stderr handling.

Instead, we use **file descriptor 3** as a dedicated IPC channel:

```ts
// In spawnClaudeCodeProcess:
const child = spawn(command, args, {
  stdio: ["pipe", "pipe", "pipe", "pipe"], // fd 0=stdin, 1=stdout, 2=stderr, 3=ipc
});

// fd 3 is a dedicated pipe, invisible to the SDK
const rl = createInterface({ input: child.stdio[3] });
rl.on("line", (line) => {
  /* parse messages */
});
```

**Advantages over stderr:**

- No interference with SDK's stderr handling
- No line-buffering needed (dedicated stream, no interleaving)
- No prefix filtering ambiguity (only interceptor data arrives on fd 3)
- stderr remains clean for real errors and debug output

**Verified:** Bun supports `fs.writeSync(3, ...)` when fd 3 is opened by the parent via `stdio: ["pipe","pipe","pipe","pipe"]`. Tested end-to-end: Node parent spawns bun child with `--preload`, interceptor writes to fd 3, parent reads lines correctly. stdout and stderr remain independent.

### IPC Protocol

Two message types over fd 3:

- `__NV_READY\n` — handshake, emitted once on interceptor init
- `__NV_REQ:<json>\n` — request data, one per phase (start/end)

Each `__NV_REQ` message contains summary fields and an optional `detail` object. The `RequestTracker` splits them on receipt.

```ts
type InterceptorMessage = {
  id: string;
  phase: "start" | "end";
  // ... summary fields (see RequestSummary) ...
  detail?: {
    request?: { headers: Record<string, string>; rawBody: string };
    response?: { headers: Record<string, string>; body: unknown };
  };
};
```

**"start" phase:** Summary fields only. No `detail`. Small (~1-5KB). Provides immediate in-flight indicator in the UI.

**"end" phase:** Summary fields + `detail` containing both the full request body (`rawBody` as string) and the full response body (assembled for streams). This is the only message that carries body data.

One message per phase, one parse per message, one handler in the spawn wrapper.

### Ready Handshake

The interceptor emits `__NV_READY\n` on fd 3 immediately after patching `globalThis.fetch`. The spawn wrapper sets a 5-second timeout to detect silent failures (file not found, syntax error in bundle, bun version incompatibility):

```ts
let interceptorReady = false;

rl.on("line", (line) => {
  if (line === "__NV_READY") {
    interceptorReady = true;
    return;
  }
  if (!line.startsWith("__NV_REQ:")) return;
  // ... parse request message ...
});

setTimeout(() => {
  if (!interceptorReady) {
    log("WARNING: network interceptor did not initialize within 5s — sessionId=%s", sessionId);
    this.requestTracker.markInspectorFailed(sessionId);
  }
}, 5000);
```

Without this, a broken interceptor silently produces no data, and the Network panel shows "Waiting for API requests..." forever. With the handshake, the panel can show "Network Inspector failed to initialize" and suggest checking the logs.

### Write Strategy: Sync Start, Async End

The "start" phase is summary-only (~1-5KB) and must arrive immediately for the in-flight indicator. It uses **synchronous** `fs.writeSync(3, ...)`.

The "end" phase includes full request + response bodies and can be large (10KB-1MB+). It uses **asynchronous** `fs.write(3, data, callback)` to avoid blocking the CLI's event loop.

```ts
const originalFetch = globalThis.fetch;
let ipcAlive = true;
const fd3 = 3;

// Emit ready handshake
try {
  fs.writeSync(fd3, "__NV_READY\n");
} catch {
  ipcAlive = false;
}

// Sync write for small, time-critical messages (start phase, summary only)
function emitSync(data: InterceptorMessage) {
  if (!ipcAlive) return;
  try {
    fs.writeSync(fd3, `__NV_REQ:${JSON.stringify(data)}\n`);
  } catch {
    ipcAlive = false;
    globalThis.fetch = originalFetch;
  }
}

// Async write for large messages (end phase with full bodies)
function emitAsync(data: InterceptorMessage) {
  if (!ipcAlive) return;
  try {
    fs.write(fd3, `__NV_REQ:${JSON.stringify(data)}\n`, (err) => {
      if (err) {
        ipcAlive = false;
        globalThis.fetch = originalFetch;
      }
    });
  } catch {
    ipcAlive = false;
    globalThis.fetch = originalFetch;
  }
}
```

**Why "start" carries no body:** The request body for a long conversation can be 500KB+ (full message history + system prompt + tools). A synchronous write of that size blocks the CLI event loop before every API call, adding latency. By deferring all body data to the async "end" phase, the interceptor never blocks on large payloads. The trade-off: clicking an in-flight request in the detail panel shows "Request details available when complete" — acceptable since requests complete in 1-10 seconds.

### Graceful Pipe Close Handling

If the Electron main process crashes or closes the fd 3 pipe while the CLI is still running, `fs.writeSync` / `fs.write` throws `EBADF` or `EPIPE`. Both `emitSync` and `emitAsync` catch this and silently disable interception by restoring the original `globalThis.fetch`. Claude Code continues unaffected.

### Zero-Copy Request Body Forwarding

The Anthropic SDK already calls `JSON.stringify()` on the request body before passing it to `fetch(url, { body: stringifiedBody })`. The interceptor avoids a wasteful parse-then-re-stringify round-trip by forwarding the raw string:

```ts
// In the patched fetch:
const rawBody = typeof options.body === "string" ? options.body : JSON.stringify(options.body);

// Parse once to extract summary fields (model, message count, tool names)
let parsed: any;
try {
  parsed = JSON.parse(rawBody);
} catch {
  parsed = null;
}

const summaryFields = {
  model: parsed?.model,
  isStream: parsed?.stream === true,
  messageCount: Array.isArray(parsed?.messages) ? parsed.messages.length : undefined,
  toolNames: Array.isArray(parsed?.tools) ? parsed.tools.map((t: any) => t.name) : undefined,
  maxTokens: parsed?.max_tokens,
  systemPromptLength:
    typeof parsed?.system === "string"
      ? parsed.system.length
      : Array.isArray(parsed?.system)
        ? JSON.stringify(parsed.system).length
        : undefined,
};

// "start" phase: summary only (sync, small)
emitSync({ id, phase: "start", ...summaryFields, url, method, headers: maskedHeaders });

const response = await originalFetch.apply(this, arguments);

// "end" phase: summary + detail with raw body string (async, can be large)
emitAsync({
  id,
  phase: "end",
  ...summaryFields,
  ...responseFields,
  detail: {
    request: { headers: maskedHeaders, rawBody }, // raw string, no re-serialize
    response: { headers: responseHeaders, body: assembledResponse },
  },
});
```

On the parent side, `RequestDetail.request.rawBody` is a string. The renderer parses it lazily with `JSON.parse()` only when the user opens the Request tab. This avoids **two full serialization round-trips** (parse + stringify) of 500KB+ on every intercepted request.

## Configuration

### `networkInspector` Setting

The interceptor is **opt-in** to avoid overhead when not needed. A new `networkInspector` boolean config field controls it.

**Config type** (`shared/features/config/types.ts`):

```ts
export type AppConfig = {
  // ... existing fields ...
  /** Enable the network inspector to see API requests in the Network panel. */
  networkInspector: boolean;
};
```

Default: `false`.

**Settings UI** (`features/settings/components/panels/chat-panel.tsx`):

Add a `<Switch>` in the Chat settings panel (alongside `tokenOptimization`):

```tsx
<SettingsRow
  title="Network Inspector"
  description="Show API requests in the Network panel. Requires starting a new session to take effect."
>
  <Switch checked={networkInspector} onCheckedChange={(v) => setConfig("networkInspector", v)} />
</SettingsRow>
```

**Persistence:** Uses the existing config flow — `electron-store` writes to `~/.neovate-desktop/config.json`, same as all other config fields. The renderer store's `setConfig()` optimistically updates local state and calls `client.config.set()` to persist.

**Behavior when toggled:**

- Toggling the setting takes effect on the **next session** (since `--preload` is a spawn-time decision).
- The Network panel is always visible in the content panel list but shows context-appropriate states (see Session Switching Behavior below).
- No session restart prompt — the user naturally starts new sessions.

**Session manager reads the config** (`session-manager.ts`):

```ts
const networkInspector = this.configStore.get("networkInspector") === true;
const options: Options = {
  ...queryOpts,
  ...(networkInspector ? { spawnClaudeCodeProcess: buildInspectorSpawn(sessionId) } : {}),
};
```

## In-Memory Data Model

All intercepted data is stored **entirely in memory** in the `RequestTracker`. No temp files, no disk I/O.

The "start" phase message carries summary fields only. The "end" phase message carries summary fields plus the `detail` object (full request + response bodies). The `RequestTracker` stores summaries in an array (for list queries) and details in a Map (for detail queries).

### Eviction: Dual Cap

The ring buffer uses two caps to prevent unbounded memory growth:

```ts
const MAX_ENTRIES = 500;
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50MB

// In onMessage():
while (session.summaries.length > MAX_ENTRIES || session.totalBodyBytes > MAX_BODY_BYTES) {
  const evicted = session.summaries.shift()!;
  const bodySize = session.bodySizes.get(evicted.id) ?? 0;
  session.totalBodyBytes -= bodySize;
  session.bodySizes.delete(evicted.id);
  session.bodies.delete(evicted.id);
}
```

**Why dual cap:** Entry count alone isn't enough. In long conversations, each successive request carries a larger message history. Request #50 might have a 300KB body. With count-only eviction, 500 large entries could consume 100MB+. The byte cap ensures memory stays bounded regardless of per-entry size.

- **Short sessions:** hit the 500-entry cap first (~25MB typical)
- **Long sessions with big contexts:** hit the 50MB cap first (fewer entries retained)

### Per-Session Inspector State

The `RequestTracker` tracks per-session inspector state with three possible values:

```ts
type InspectorState = "enabled" | "failed" | "not-enabled";

class RequestTracker {
  private inspectorState = new Map<string, InspectorState>();

  markInspectorEnabled(sessionId: string): void {
    this.inspectorState.set(sessionId, "enabled");
  }

  markInspectorFailed(sessionId: string): void {
    this.inspectorState.set(sessionId, "failed");
  }

  getInspectorState(sessionId: string): InspectorState {
    return this.inspectorState.get(sessionId) ?? "not-enabled";
  }
}
```

Called by `session-manager.ts`: `markInspectorEnabled` when `spawnClaudeCodeProcess` is used, `markInspectorFailed` when the ready handshake times out. The renderer queries this to determine panel state (see Session Switching Behavior).

### RequestSummary (list rendering)

```ts
type RequestSummary = {
  id: string; // crypto.randomUUID()
  sessionId: string; // from NV_SESSION_ID env var
  phase: "start" | "end"; // two messages per request
  timestamp: number; // Date.now()
  turnIndex: number; // assigned by RequestTracker on receipt

  // Request info (both phases)
  url: string;
  method: string;
  model?: string;
  isStream?: boolean;
  headers: Record<string, string>; // credentials masked

  // Request body summary (start phase)
  messageCount?: number;
  toolNames?: string[];
  systemPromptLength?: number;
  maxTokens?: number;

  // Response info (end phase only)
  status?: number;
  duration?: number; // ms from fetch start to response complete
  responseHeaders?: Record<string, string>;
  stopReason?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens?: number;
    cacheCreationInputTokens?: number;
  };
  contentBlockTypes?: string[]; // ["text", "thinking", "tool_use"]
  error?: string;
};
```

### RequestDetail (on-demand detail)

Stored in the bodies Map, keyed by request ID. Only present for "end" phase messages. Sent to renderer via `getRequestDetail()` when the user selects a completed request.

```ts
type RequestDetail = {
  id: string;
  request: {
    headers: Record<string, string>;
    rawBody: string; // raw JSON string from fetch options.body (zero-copy)
  };
  response?: {
    headers: Record<string, string>;
    body: unknown; // assembled response (for streams: reconstructed message)
  };
};
```

Note: `request.rawBody` is a string, not a parsed object. The renderer parses it lazily when the user opens the Request tab.

## Cost Estimation

Per-request and per-turn cost is estimated using a static price table:

```ts
const MODEL_PRICING: Record<
  string,
  {
    inputPer1M: number;
    outputPer1M: number;
    cacheReadPer1M: number;
  }
> = {
  "claude-opus-4-6": { inputPer1M: 15, outputPer1M: 75, cacheReadPer1M: 1.5 },
  "claude-sonnet-4-6": { inputPer1M: 3, outputPer1M: 15, cacheReadPer1M: 0.3 },
  "claude-haiku-4-5": { inputPer1M: 0.8, outputPer1M: 4, cacheReadPer1M: 0.08 },
};

function estimateCost(model: string, usage: RequestSummary["usage"]): number {
  const pricing = MODEL_PRICING[model] ?? MODEL_PRICING["claude-sonnet-4-6"];
  if (!usage) return 0;
  return (
    (usage.inputTokens * pricing.inputPer1M +
      usage.outputTokens * pricing.outputPer1M +
      (usage.cacheReadInputTokens ?? 0) * pricing.cacheReadPer1M) /
    1_000_000
  );
}
```

- Price table is updated with app releases. Unknown models fall back to Sonnet pricing.
- Per-request cost shown in the detail panel usage breakdown.
- Per-turn cost shown in the turn header subtotals.
- Session total shown in the footer.
- The SDK's `total_cost_usd` from result messages serves as ground truth for turn-level totals — when available, it overrides the estimate.

## Interceptor Design

### Build Strategy

The interceptor is written in **TypeScript** alongside the rest of the codebase and **bundled separately** with esbuild into a single standalone file. This is better than writing raw JS with no imports because:

- Proper TypeScript with type checking
- Reusable, tested SSE stream assembly function (~100 lines of stateful parsing)
- Unit-testable with vitest
- Can share type definitions with `request-types.ts`

**Build pipeline:**

```ts
// In electron-builder or vite config:
esbuild.build({
  entryPoints: ["src/main/features/agent/interceptor/fetch-interceptor.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: "resources/fetch-interceptor.js",
  external: [], // fully self-contained
});
```

**Source location:** `packages/desktop/src/main/features/agent/interceptor/`

```
interceptor/
  fetch-interceptor.ts    # Entry point: patch + URL matching + emit
  stream-assembler.ts     # SSE event -> complete message reconstruction (class, instantiated per request)
  credential-mask.ts      # API key / auth header masking
  types.ts                # Shared types (imported from request-types.ts at build)
  __tests__/
    stream-assembler.test.ts
    credential-mask.test.ts
    fetch-interceptor.test.ts
    integration.test.ts     # End-to-end: spawn bun with --preload, verify fd 3 output
```

### Fetch Patch Logic

```
globalThis.fetch (patched)
  |
  |-- Is URL an Anthropic API call?
  |   (URL contains "anthropic" or "claude",
  |    or hostname matches ANTHROPIC_BASE_URL,
  |    or path matches /v1/messages)
  |
  |-- NO  -> call original fetch, return unchanged
  |-- YES ->
  |     1. Generate request ID
  |     2. Grab raw request body string (zero-copy from fetch options.body)
  |     3. Parse body once for summary extraction (model, message count, tool names)
  |     4. Extract & mask credentials from headers
  |     5. emitSync "start" (summary only, no detail)
  |     6. Call original fetch
  |     7. If stream response:
  |        a. Create new StreamAssembler() for THIS request
  |        b. Wrap ReadableStream with pass-through that feeds assembler
  |        c. On stream end: get assembled message from assembler
  |        d. emitAsync "end" (summary + detail: rawBody + assembled response)
  |        e. Return new Response with pass-through stream
  |     8. If non-stream response:
  |        a. Clone response, read body
  |        b. emitAsync "end" (summary + detail: rawBody + response body)
  |        c. Return original response
```

### SSE Stream Assembly

For streaming responses, the interceptor creates a **new `StreamAssembler` instance per request**. This is critical because the Anthropic SDK can have multiple concurrent in-flight requests (main agent + sub-agents making parallel tool calls). A shared/singleton assembler would corrupt data when concurrent streams interleave.

```ts
class StreamAssembler {
  private message: any = {};
  private contentBlocks: any[] = [];
  private currentBlockInputJson = "";

  processEvent(event: { type: string; [key: string]: any }): void {
    switch (event.type) {
      case "message_start": // initialize envelope
      case "content_block_start": // create block
      case "content_block_delta": // append to block
      case "content_block_stop": // finalize block
      case "message_delta": // set stop_reason, merge usage
      case "message_stop": // no-op
    }
  }

  finalize(): any {
    return { ...this.message, content: this.contentBlocks };
  }
}
```

Each patched fetch call creates its own `StreamAssembler`, feeds it chunks from that request's stream, and calls `finalize()` when the stream ends. No shared state between concurrent requests.

Event handling follows cc-viewer's `assembleStreamMessage()`:

- `message_start` -> initialize message envelope (id, model, usage)
- `content_block_start` -> create content block (text, thinking, tool_use)
- `content_block_delta` -> append to block (text_delta, thinking_delta, input_json_delta)
- `content_block_stop` -> finalize block (parse accumulated JSON for tool_use)
- `message_delta` -> set stop_reason, merge usage
- `message_stop` -> no-op

### Credential Masking

API keys masked before any output: `sk-ant-api03-abcdef...xyz` -> `sk-ant-****xyz`. Authorization headers masked similarly, preserving the scheme.

### URL Matching

A request is captured if ANY of these match:

- URL contains `anthropic` or `claude`
- URL hostname matches `ANTHROPIC_BASE_URL` env var
- URL path matches `/v1/messages` or `/api/eval/sdk-*`

## Main Process Changes

### a) Interceptor Source

**Location:** `packages/desktop/src/main/features/agent/interceptor/fetch-interceptor.ts`

Built to: `packages/desktop/resources/fetch-interceptor.js` (added to electron-builder `extraResources`). In dev mode, built on-the-fly or referenced from the build output.

### b) session-manager.ts

Add `spawnClaudeCodeProcess` to the query options, gated by the `networkInspector` config:

```ts
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

// In initSession():
const networkInspector = this.configStore.get("networkInspector") === true;

if (networkInspector) {
  this.requestTracker.markInspectorEnabled(sessionId);
}

const options: Options = {
  ...queryOpts,
  ...(networkInspector
    ? {
        spawnClaudeCodeProcess: (spawnOpts) => {
          const interceptorPath = resolveInterceptorPath();

          // --preload must appear before the script path in bun args.
          // spawnOpts.args = ["/path/to/cli.js", ...sdkFlags]
          // Result: bun --preload interceptor.js /path/to/cli.js ...sdkFlags
          const child = spawn(
            spawnOpts.command,
            ["--preload", interceptorPath, ...spawnOpts.args],
            {
              cwd: spawnOpts.cwd,
              env: {
                ...spawnOpts.env,
                NV_SESSION_ID: sessionId,
              },
              signal: spawnOpts.signal,
              stdio: ["pipe", "pipe", "pipe", "pipe"], // fd 3 = IPC
            },
          );

          // Read interceptor data from fd 3
          let interceptorReady = false;
          const ipcStream = child.stdio[3];
          if (ipcStream && "on" in ipcStream) {
            const rl = createInterface({ input: ipcStream as NodeJS.ReadableStream });
            rl.on("line", (line) => {
              if (line === "__NV_READY") {
                interceptorReady = true;
                return;
              }
              if (!line.startsWith("__NV_REQ:")) return;
              try {
                const msg = JSON.parse(line.slice("__NV_REQ:".length));
                this.requestTracker.onMessage(sessionId, msg);
              } catch {
                /* malformed, skip */
              }
            });
          }

          // Detect interceptor init failure
          setTimeout(() => {
            if (!interceptorReady) {
              log("WARNING: network interceptor did not initialize — sessionId=%s", sessionId);
              this.requestTracker.markInspectorFailed(sessionId);
            }
          }, 5000);

          return child; // satisfies SpawnedProcess interface
        },
      }
    : {}),
};
```

Also, in `SessionManager.stream()`, call `startTurn()` before pushing the user message:

```ts
this.requestTracker.startTurn(sessionId);
session.input.push({ type: "user", ... });
```

### c) RequestTracker service

**Location:** `packages/desktop/src/main/features/agent/request-tracker.ts`

```ts
const MAX_ENTRIES = 500;
const MAX_BODY_BYTES = 50 * 1024 * 1024; // 50MB

type InspectorState = "enabled" | "failed" | "not-enabled";

class RequestTracker {
  private sessions = new Map<
    string,
    {
      summaries: RequestSummary[];
      bodies: Map<string, RequestDetail>;
      bodySizes: Map<string, number>;
      totalBodyBytes: number;
    }
  >();
  private currentTurn = new Map<string, number>();
  private inspectorState = new Map<string, InspectorState>();
  readonly eventPublisher = new EventPublisher<Record<string, RequestSummary>>();

  /** Record that a session was spawned with the interceptor. */
  markInspectorEnabled(sessionId: string): void {
    this.inspectorState.set(sessionId, "enabled");
  }

  /** Record that the interceptor failed to initialize (ready timeout). */
  markInspectorFailed(sessionId: string): void {
    this.inspectorState.set(sessionId, "failed");
  }

  /** Check per-session inspector state. */
  getInspectorState(sessionId: string): InspectorState {
    return this.inspectorState.get(sessionId) ?? "not-enabled";
  }

  /**
   * Called by spawn wrapper when a message arrives on fd 3.
   * Splits the message: summary fields -> summaries array, detail -> bodies Map.
   */
  onMessage(sessionId: string, msg: InterceptorMessage): void {
    const session = this.ensureSession(sessionId);

    // Extract and store detail separately
    const { detail, ...summaryFields } = msg;
    const summary: RequestSummary = {
      ...summaryFields,
      turnIndex: this.currentTurn.get(sessionId) ?? 0,
    };

    session.summaries.push(summary);

    if (detail) {
      const byteSize =
        (detail.request?.rawBody?.length ?? 0) +
        (typeof detail.response?.body === "string"
          ? detail.response.body.length
          : JSON.stringify(detail.response?.body ?? "").length);
      session.bodies.set(msg.id, detail as RequestDetail);
      session.bodySizes.set(msg.id, byteSize);
      session.totalBodyBytes += byteSize;
    }

    // Dual-cap eviction
    while (session.summaries.length > MAX_ENTRIES || session.totalBodyBytes > MAX_BODY_BYTES) {
      const evicted = session.summaries.shift()!;
      const evictedSize = session.bodySizes.get(evicted.id) ?? 0;
      session.totalBodyBytes -= evictedSize;
      session.bodySizes.delete(evicted.id);
      session.bodies.delete(evicted.id);
    }

    this.eventPublisher.publish(sessionId, summary);
  }

  /** Mark the start of a new turn (called by SessionManager.stream()). */
  startTurn(sessionId: string): void {
    this.currentTurn.set(sessionId, (this.currentTurn.get(sessionId) ?? 0) + 1);
  }

  /** Get all request summaries for a session. */
  getRequests(sessionId: string): RequestSummary[] {
    return this.sessions.get(sessionId)?.summaries ?? [];
  }

  /** Get full body for a specific request (from memory). */
  getRequestDetail(sessionId: string, requestId: string): RequestDetail | null {
    return this.sessions.get(sessionId)?.bodies.get(requestId) ?? null;
  }

  /** Clear request data for a session (user clicked [clear]). */
  clearRequests(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.summaries = [];
      session.bodies.clear();
      session.bodySizes.clear();
      session.totalBodyBytes = 0;
    }
  }

  /** Full cleanup on session close. */
  clearSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.currentTurn.delete(sessionId);
    this.inspectorState.delete(sessionId);
  }
}
```

### d) oRPC Contract

New methods in the agent contract:

```ts
// shared/features/agent/contract.ts
listRequests: oc.input(z.object({ sessionId: z.string() })).output(z.array(requestSummarySchema));
getRequestDetail: oc.input(z.object({ sessionId: z.string(), requestId: z.string() })).output(
  requestDetailSchema.nullable(),
);
getInspectorState: oc.input(z.object({ sessionId: z.string() })).output(
  z.enum(["enabled", "failed", "not-enabled"]),
);
clearRequests: oc.input(z.object({ sessionId: z.string() })).output(z.void());
subscribeRequests: oc.input(z.object({ sessionId: z.string() })).output(z.void()); // via EventPublisher
```

## Renderer UI

### Network Plugin

The Network panel is implemented as a **plugin**, following the same pattern as existing content panels (`plugins/terminal/`, `plugins/git/`, `plugins/files/`):

```
plugins/network/
  index.tsx           # Plugin registration: contributes content panel view
  network-view.tsx    # Main panel component (split list + detail)
  components/
    turn-group.tsx    # Collapsible turn section with subtotals
    request-row.tsx   # Single request row with context bar
    detail-panel.tsx  # Tabbed detail view (Headers / Request / Response)
    usage-table.tsx   # Token + cost breakdown table
    context-bar.tsx   # Inline context window utilization bar
    empty-state.tsx   # Placeholder for disabled / failed / waiting states
  store.ts            # Zustand store for request list + selected request
```

This keeps the feature modular, consistent with the existing plugin architecture, and independently testable.

### Renderer Store: Request Lifecycle

The network store merges the two-phase (`start` + `end`) protocol into unified request rows for rendering:

```ts
type MergedRequest = {
  id: string;
  requestState: "in-flight" | "complete" | "error";
  turnIndex: number;
  timestamp: number;

  // From "start" phase
  url: string;
  method: string;
  model?: string;
  isStream?: boolean;
  headers: Record<string, string>;
  messageCount?: number;
  toolNames?: string[];
  maxTokens?: number;

  // From "end" phase (filled when end arrives)
  httpStatus?: number;
  duration?: number;
  stopReason?: string;
  usage?: RequestSummary["usage"];
  contentBlockTypes?: string[];
  error?: string;
};

type NetworkState = {
  // Merged request entries keyed by request ID
  requests: Map<string, MergedRequest>;
  // Turn index -> ordered request IDs for grouped rendering
  turns: Map<number, string[]>;
  // Currently selected request
  selectedRequestId: string | null;
  selectedDetail: RequestDetail | null;
  // Inspector state for current session
  inspectorState: InspectorState;

  // Actions
  onSummary: (summary: RequestSummary) => void;
  selectRequest: (requestId: string) => void;
  clear: () => void;
  switchSession: (sessionId: string) => void;
};
```

**Phase merging logic:**

```
When "start" summary arrives:
  1. Create new MergedRequest with requestState "in-flight"
  2. Fill request-side fields (url, model, headers, messageCount, etc.)
  3. Add to turns Map under the summary's turnIndex
  4. UI shows row with animated dot, no duration/tokens yet

When "end" summary arrives with matching ID:
  1. Find existing MergedRequest by ID
  2. Merge response-side fields (httpStatus, duration, usage, stopReason, etc.)
  3. Set requestState to "complete" (or "error" if error field present)
  4. UI row updates in-place: dot turns green, duration/tokens fill in

When "end" arrives without a prior "start" (e.g., non-stream fast response):
  1. Create a complete MergedRequest directly with requestState "complete"
  2. Fill all fields from the single message
```

### Session Switching Behavior

When the user switches between sessions in the sidebar, the Network panel transitions between four states:

**State 1: Inspector enabled, has data**

- Fetch request list via `listRequests(sessionId)`
- Subscribe to new requests via `subscribeRequests(sessionId)`
- Show full request list + detail panel

**State 2: Inspector enabled, no data yet**

- Show "Waiting for API requests..." with a subtle animated indicator
- Requests appear as they arrive via subscription

**State 3: Inspector failed to initialize**

- Show "Network Inspector failed to initialize for this session. Check logs for details."
- Suggests restarting the session

**State 4: Inspector not enabled for this session**

- Show placeholder: "Network Inspector was not enabled when this session started."
- If the global `networkInspector` config is currently ON: "New sessions will have the inspector enabled."
- If the global config is OFF: "Enable Network Inspector in Settings > Chat" with a button to open settings.

The panel queries `getInspectorState(sessionId)` to determine which state to show. This is important because the global config might be ON now, but a session started before it was enabled won't have the interceptor.

**On switch:**

1. Unsubscribe from previous session's event stream
2. Clear current store state
3. Query `getInspectorState(newSessionId)` for panel state
4. If enabled: fetch `listRequests(newSessionId)`, subscribe to `subscribeRequests(newSessionId)`
5. Render appropriate state

### Content Panel Registration

Always visible when a session is active. The panel uses the four states above to render context-appropriate content.

### Layout: Turn-Grouped Request List

Requests are grouped by conversation turn. Each turn is a collapsible section showing the user message that triggered it and all API calls within that turn.

```
+-----------------------------------------------------+
| Network                            [filter] [clear]  |
| +----------------------+----------------------------+|
| | Turn 3: "Fix the auth bug"                        ||
| |   Total: 57.8k tok | $0.42 | 11.7s               ||
| | |-----------------------------------------|        ||
| | | #  Model   Tok   Ctx    ms | Headers    |        ||
| | |  1 opus    45k   22%  8.1s | [selected] |        ||
| | |     * stream  main         |            |        ||
| | |  2 haiku   800   4%  0.4s  | Request    |        ||
| | |     * stream  sub          |            |        ||
| | |  3 opus    12k  28%  3.2s  | Response   |        ||
| | |     * stream  main         |            |        ||
| | |-----------------------------------------|        ||
| |                                |                   ||
| | Turn 2: "Add tests for..."    | POST /v1/messages  ||
| |   Total: 23k tok | $0.18     | x-api-key: sk-**** ||
| |  [collapsed]                  | model: opus-4-6    ||
| |                                | stream: true      ||
| +----------------------+----------------------------+|
| Session: 12 reqs | 120k tokens | $0.95 | 32s API    |
+-----------------------------------------------------+
```

### Left Panel: Turn-Grouped Request List

**Turn headers:**

- User message preview (first ~60 chars)
- Turn subtotals: token count, estimated cost, total API time
- Collapsible (click to expand/collapse)
- Most recent turn expanded by default

**Request rows (within a turn):**

- **Columns:** #, Model (short name), Tokens (input+output), Context %, Duration
- **Context %:** thin inline progress bar showing `inputTokens / maxContextTokens`
- **Badges:** `stream`/`non-stream`, `main`/`sub` agent
- **Status:** green dot (complete), animated dot (in-flight), red dot (error/retry)
- **Auto-scroll:** new requests scroll into view unless user has scrolled up

**Filter bar:**

- Free text search (matches model, URL)
- Toggles: errors-only, main-agent-only

**[clear] button:**

- Calls `clearRequests(sessionId)` via oRPC, then clears the renderer store
- Useful to focus on a specific interaction without noise from earlier turns

**Footer:**

- Session-level totals: total requests, total tokens, total estimated cost, total API time

### Right Panel: Request Detail (3 tabs)

**Headers tab:**

- Request headers in key-value grid (monospace)
- Response headers below, separated by a divider
- Masked credentials shown as-is (user can see the masking)

**Request tab:**

- Full request body fetched via `getRequestDetail()` on first selection (from memory, fast)
- `rawBody` string parsed lazily by the renderer with `JSON.parse()`
- Collapsible JSON tree viewer
- Sections: Model config, System prompt, Messages (collapsible per message), Tools
- Syntax highlighting for code blocks within messages
- For in-flight requests: "Request details available when complete"

**Response tab:**

- Full response body fetched alongside request
- For assembled stream responses: shows the reconstructed message
- Content blocks rendered by type: text, thinking (collapsible), tool_use (with parsed input)
- Usage breakdown table: input tokens, output tokens, cache read, cache creation, estimated cost

### Copy Actions

The detail panel toolbar includes two copy actions:

**Copy as cURL:**
Generates a cURL command from the captured request with masked API key:

```bash
curl -X POST 'https://api.anthropic.com/v1/messages' \
  -H 'x-api-key: sk-ant-****xyz' \
  -H 'content-type: application/json' \
  -H 'anthropic-version: 2023-06-01' \
  -d '{"model":"claude-opus-4-6","max_tokens":16384,...}'
```

Developers can replace the masked key with their own and reproduce the exact request.

**Copy as JSON:**
Copies the full `RequestDetail` object (request + response) as formatted JSON. Useful for pasting into bug reports or log analysis.

Both actions copy to clipboard with a brief toast notification ("Copied to clipboard").

### Context Window Utilization

Each request row shows a compact context utilization indicator:

```
| opus  45k/200k [########______] 22%  8.1s |
```

- Thin bar (4px height) below the token count
- Color grades: green (0-60%), yellow (60-80%), red (80-100%)
- Helps developers spot when conversations approach context limits before compaction kicks in
- `maxContextTokens` derived from static model lookup table; unknown models default to 200k

### Styling

- Follows existing design system: neutral surfaces, `#fa216e` for selected/active states
- Monospace font (JetBrains Mono / system monospace) for headers and JSON
- Compact row height for information density (dev tool aesthetic)
- Full dark/light theme support
- Resizable split between list and detail panels

## Implementation Phases

### Phase 1: Core Pipeline

Get data flowing end-to-end. Validates the architecture before investing in UI polish.

- `fetch-interceptor.ts`: patch, URL matching, credential masking, stream assembly, fd 3 emit
- `spawnClaudeCodeProcess`: `--preload` injection, fd 3 reading, ready handshake
- `RequestTracker`: in-memory store, dual-cap eviction, inspector state tracking
- `networkInspector` config: type, default, `<Switch>` in chat panel, persistence
- oRPC: `listRequests`, `getRequestDetail`, `getInspectorState`, `subscribeRequests`
- Network plugin: basic **flat** request list (no turn grouping), detail panel with 3 tabs
- Session switching with four panel states
- Integration test: spawn bun with `--preload`, mock fetch, verify fd 3 output

### Phase 2: Polish

UI features that improve usability.

- Turn grouping (wire `startTurn()` in `SessionManager.stream()`, group by `turnIndex`)
- Context window utilization bar
- Cost estimation with static price table
- Copy as cURL / Copy as JSON
- Filter bar + [clear] button

### Phase 3: Advanced

Nice-to-have features for power users.

- Sub-agent classification heuristic (`isMainAgentRequest()`)
- Error-only / main-agent-only filter toggles
- Session-level totals footer using SDK `total_cost_usd` as ground truth
- Export session requests as JSON file

## File Changes Summary

### New Files

| File                                                                        | Description                                                              |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `packages/desktop/src/main/features/agent/interceptor/fetch-interceptor.ts` | Fetch monkey-patch entry point                                           |
| `packages/desktop/src/main/features/agent/interceptor/stream-assembler.ts`  | Per-request SSE event reconstruction class                               |
| `packages/desktop/src/main/features/agent/interceptor/credential-mask.ts`   | API key / auth header masking                                            |
| `packages/desktop/src/main/features/agent/interceptor/__tests__/`           | Unit + integration tests                                                 |
| `packages/desktop/src/main/features/agent/request-tracker.ts`               | In-memory request store + EventPublisher                                 |
| `packages/desktop/src/shared/features/agent/request-types.ts`               | RequestSummary + RequestDetail + InterceptorMessage type definitions     |
| `packages/desktop/src/renderer/src/plugins/network/index.tsx`               | Plugin registration (contributes content panel)                          |
| `packages/desktop/src/renderer/src/plugins/network/network-view.tsx`        | Main panel component                                                     |
| `packages/desktop/src/renderer/src/plugins/network/components/`             | Turn group, request row, detail panel, context bar, empty state          |
| `packages/desktop/src/renderer/src/plugins/network/store.ts`                | Zustand store: MergedRequest lifecycle, session switching, turn grouping |

### Modified Files

| File                                                                                   | Change                                                                                                                     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/shared/features/config/types.ts`                                 | Add `networkInspector: boolean` to `AppConfig`                                                                             |
| `packages/desktop/src/renderer/src/features/config/store.ts`                           | Add `networkInspector` default (`false`)                                                                                   |
| `packages/desktop/src/renderer/src/features/settings/components/panels/chat-panel.tsx` | Add Network Inspector switch                                                                                               |
| `packages/desktop/src/main/features/agent/session-manager.ts`                          | Add conditional `spawnClaudeCodeProcess`, fd 3 reading, ready handshake, `startTurn()` call, `markInspectorEnabled()` call |
| `packages/desktop/src/shared/features/agent/contract.ts`                               | Add listRequests, getRequestDetail, getInspectorState, clearRequests, subscribeRequests                                    |
| `packages/desktop/src/main/features/agent/router.ts`                                   | Implement new oRPC handlers                                                                                                |
| `electron-builder.yml` (or equivalent)                                                 | Add `resources/fetch-interceptor.js` to extraResources                                                                     |
| esbuild / vite config                                                                  | Add interceptor bundle step                                                                                                |

## Edge Cases

1. **Double-patch guard:** Set `globalThis.__nvInterceptorInstalled = true` to prevent double-patching if the interceptor loads twice.
2. **Non-Anthropic requests:** Only intercept matching URLs. All other fetch calls pass through untouched.
3. **fd 3 pipe closed:** If the parent process crashes, both sync and async writes catch the error and restore the original `globalThis.fetch`, silently disabling interception without affecting Claude Code.
4. **Interceptor init failure:** Ready handshake times out after 5s. `RequestTracker` marks session as `"failed"`. Panel shows clear error instead of waiting forever.
5. **Provider custom URLs:** The interceptor reads `ANTHROPIC_BASE_URL` from env to match custom provider endpoints.
6. **Retries:** The Anthropic SDK retries failed requests internally. Each retry appears as a separate intercepted request, giving visibility into retry behavior.
7. **Concurrent requests:** Main agent + sub-agents can have multiple in-flight requests simultaneously. Each patched fetch call creates its own `StreamAssembler` instance — no shared state between concurrent streams.
8. **Sub-agent classification:** Derived from the request body (presence of "You are Claude Code" in system, tool count, ToolSearch) using the same heuristic as cc-viewer's `isMainAgentRequest()`.
9. **Inspector toggled mid-session:** Setting change only takes effect on new sessions. The per-session `getInspectorState()` lets the UI show the correct state.
10. **Memory bounds:** Dual-cap eviction (500 entries OR 50MB body size). Short sessions hit entry cap; long sessions with large contexts hit byte cap. Multiple concurrent sessions have independent buffers.
11. **Context window limits:** Model-to-context-size mapping maintained as a static lookup table. Unknown models default to 200k.
12. **Cost estimation accuracy:** Static price table may drift from actual pricing. The SDK's `total_cost_usd` from result messages is used as ground truth for turn-level totals when available.
13. **JSON.stringify failures:** The interceptor wraps all serialization in try/catch. Circular references or BigInts in request/response bodies are caught; the body field is set to `"[serialization error]"` and the summary is still emitted.
14. **Orphaned "start" messages:** If the CLI crashes mid-request, a "start" with no matching "end" remains in the store as an "in-flight" row. The row persists until session close or eviction — no special cleanup needed.
15. **In-flight detail view:** Clicking an in-flight request shows "Request details available when complete" in the Request/Response tabs, since body data only arrives with the "end" phase.
