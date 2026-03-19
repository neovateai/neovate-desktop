# Editor Bridge Hardening: Health Check, Graceful Shutdown & Credential Sanitization

**Date**: 2026-03-17
**Status**: Draft
**Scope**: `src/main/plugins/editor/`, `src/main/core/plugin/`, `src/renderer/src/plugins/editor/`, `src/main/features/agent/`

## Problem

Three related issues observed in production logs (user: huaqian, 2026-03-17):

1. **Extension host flip-flop** — The remote extension host (code-server) repeatedly goes unresponsive/responsive. The bridge has no heartbeat after the initial `ping` handshake, so there is no way to detect or recover from a degraded extension host until a user action times out.

2. **Unclean shutdown** — When the app restarts, `bridge.stop()` immediately calls `client.destroy()` on all TCP sockets. The renderer's code-server iframe sees WebSocket close events with `code: 1006` (abnormal closure) and enters a 3-hour reconnection loop. No shutdown signal is sent before killing connections.

3. **Credential leak** — Code-server's own shell environment extraction logs the full `process.env` (including `ANTHROPIC_AUTH_TOKEN`) in plaintext. Our code passes credentials via `settings.env` separately, so `process.env` shouldn't contain them at all when code-server starts.

## Design

### Part 1: Credential Sanitization (process.env cleanup)

**Root cause**: Code-server runs in-process via `wrapper.start()` and inherits the full `process.env`. Its internal shell-env code logs the entire environment at `[info]` level. The credentials come from the user's shell config (e.g. `.zshrc` sets `ANTHROPIC_AUTH_TOKEN`), not from our code.

**Fix**: Sanitize `process.env` before calling `wrapper.start()` in `starter.ts`. Strip env vars matching sensitive patterns. Our own code (session-manager) passes provider credentials via `settings.env` in the SDK options object, so they never need to be on `process.env`.

#### Changes

**`src/main/plugins/editor/utils/starter.ts`**:

```typescript
// Specific prefixes/suffixes known to carry credentials.
// Intentionally narrow to avoid stripping legitimate vars
// like XAUTHORITY or JAVA_AUTH_MODULE.
const SENSITIVE_PATTERNS = [
  /^ANTHROPIC_/i,
  /^OPENAI_/i,
  /^AWS_SECRET/i,
  /^AWS_SESSION/i,
  /_API_KEY$/i,
  /_AUTH_TOKEN$/i,
  /_SECRET_KEY$/i,
  /^GITHUB_TOKEN$/i,
  /^GITLAB_TOKEN$/i,
  /^NPM_TOKEN$/i,
  /^HF_TOKEN$/i,
];

function isSensitiveVar(key: string): boolean {
  return SENSITIVE_PATTERNS.some((p) => p.test(key));
}

export async function codeServerStarter(opts) {
  // ... existing setup (resourcePath, wrapperJS, cliJS, mergedArgs) ...

  // Temporarily remove sensitive vars from process.env before code-server
  // starts. Code-server runs in-process and its shell-env code logs the
  // full environment; credentials should never leak into log output.
  const scrubbed: [string, string][] = [];
  for (const key of Object.keys(process.env)) {
    if (isSensitiveVar(key) && process.env[key]) {
      scrubbed.push([key, process.env[key]!]);
      delete process.env[key];
    }
  }

  try {
    // wrapper.start() captures env synchronously on entry.
    await wrapper.start(mergedArgs);
  } finally {
    // Restore immediately — don't wait for the delay(1000).
    // Minimizes the window where concurrent code (e.g. session-manager)
    // might read process.env and find credentials missing.
    for (const [key, value] of scrubbed) {
      process.env[key] = value;
    }
  }

  return await delay(1000); // existing FIXME delay
}
```

Key decisions:

- **Narrow patterns**: Only match known credential prefixes/suffixes. No broad `/AUTH/i` or `/KEY$/i` that would hit `XAUTHORITY`, `DBUS_SESSION_BUS_ADDRESS`, etc.
- **Restore before delay**: `wrapper.start()` captures env synchronously. We restore immediately after it returns, before the `delay(1000)`, shrinking the race window from ~1s to near-zero.

> **TODO (out of scope)**: `session-manager.ts:381` spreads `...process.env` into the env passed to the SDK subprocess. If the SDK ever logs its env on error, credentials could leak there too. Consider filtering `process.env` through the same `isSensitiveVar` check in a follow-up.

---

### Part 2: Graceful Shutdown (bridge + plugin lifecycle)

**Root cause**: Two problems compound:

1. `bridge.stop()` calls `client.destroy()` (sends TCP RST) instead of `client.end()` (sends TCP FIN)
2. Plugin deactivation runs in registration order; the editor plugin should deactivate before plugins that depend on it being up

#### 2a. Bridge graceful shutdown

**`src/main/plugins/editor/utils/bridge.ts`** — Add `gracefulStop()` and `isStopped()`:

```typescript
async gracefulStop(timeoutMs: number = 500): Promise<void> {
  log("graceful stop: notifying %d clients", this.clients.size);

  // 1. Send shutdown notification to all connected clients.
  //    Even if the extension doesn't explicitly handle __shutdown__,
  //    the subsequent FIN from end() will close the connection cleanly.
  const shutdownMsg = Buffer.from(
    JSON.stringify({ operationType: "__shutdown__" })
  );
  for (const [, client] of this.clients) {
    if (!client.destroyed) {
      client.write(shutdownMsg);
      client.write("\n\n");
    }
  }

  // 2. Wait briefly for clients to process the message
  await new Promise((resolve) => setTimeout(resolve, timeoutMs));

  // 3. Graceful close: end() sends FIN (not RST), allowing the TCP
  //    connection to close cleanly. This prevents WebSocket code 1006
  //    in the iframe — the key difference from the existing stop().
  for (const [, client] of this.clients) {
    if (!client.destroyed) {
      client.end();
    }
  }

  // 4. Close the server and clean up state
  if (this.server) {
    this.server.close();
    this.server = null;
  }
  this.clients.clear();
  this.handlers.clear();

  // Clean up heartbeat intervals (Part 3)
  for (const [cwd] of this.heartbeatIntervals) {
    this.stopHeartbeat(cwd);
  }

  // Reject all pending requests
  for (const [, pending] of this.pendingRequests) {
    pending.reject(new Error("Server stopped"));
    clearTimeout(pending.timeout);
  }
  this.pendingRequests.clear();
}

isStopped(): boolean {
  return this.server === null;
}
```

The existing `stop()` method stays as-is — it remains the hard-stop fallback for abnormal exits and force-quit. `gracefulStop()` is the primary shutdown path.

**Note on `__shutdown__`**: The neovate-code-extension does NOT need to handle this message. The clean TCP closure via `end()` (FIN) is what actually prevents `1006`. The `__shutdown__` message is a courtesy signal — if the extension ever wants to do cleanup, the mechanism is there. No extension changes required for this part.

**`src/main/plugins/editor/index.ts`** — Use graceful stop with async deactivate:

```typescript
deactivate: async () => {
  log("deactivating editor plugin");
  await extBridge.gracefulStop();
  codeServerManager.stop();
},
```

> `deactivate` changes from sync `() =>` to `async () =>`. The `MainPlugin` type already allows `Promise<void>` — the plugin manager `await`s each call (`plugin-manager.ts:52`).

#### 2b. CodeServerManager.stop() cleanup

**`src/main/plugins/editor/utils/index.ts`** — Guard against double-stop. The `stop()` returned by `doStart()` only calls `bridge.stop()`. Since `deactivate()` now calls `gracefulStop()` first, this becomes a safety net:

```typescript
return {
  url,
  stop: () => {
    // Bridge shutdown is handled by the plugin's deactivate() via
    // gracefulStop(). This is a safety net for abnormal shutdown only.
    if (!bridge.isStopped()) {
      bridge.stop();
    }
  },
};
```

#### 2c. Reverse plugin deactivation order

**`src/main/core/plugin/plugin-manager.ts`** — Deactivate in reverse order (LIFO):

```typescript
async deactivate(): Promise<void> {
  log("deactivate start");
  const reversed = [...this.#plugins].reverse();
  for (const plugin of reversed) {
    if (typeof plugin.deactivate === "function") {
      log("deactivate plugin", { name: plugin.name });
      await plugin.deactivate();
    }
  }
  log("deactivate done");
}
```

Current registration order: `[git, files, terminal, editor, review]`
Deactivation becomes: `review -> editor -> terminal -> files -> git`

This ensures the editor bridge is torn down before the terminal PTY sessions are killed.

---

### Part 3: Bridge Heartbeat (health monitoring)

**Root cause**: After the initial `ping` handshake, the bridge has no ongoing health check. When the extension host becomes unresponsive, nothing detects it until a user-initiated operation times out (5s).

**Prerequisite**: The neovate-code-extension must respond to `__ping__` messages. This is a simple echo: when the extension receives `operationType: "__ping__"`, it writes back `{ requestId, success: true }`. Without this, pongs never arrive and every client gets marked unresponsive after 30s.

If modifying the extension is not feasible right now, skip 3a and fall back to TCP keepalive only (see Fallback below).

#### 3a. Server-side heartbeat in bridge

**`src/main/plugins/editor/utils/bridge.ts`** — Add periodic ping after client connects:

```typescript
private heartbeatIntervals = new Map<string, NodeJS.Timeout>();

private startHeartbeat(cwd: string, socket: net.Socket, intervalMs: number = 15000) {
  this.stopHeartbeat(cwd);

  let missedPongs = 0;
  let wasUnresponsive = false;
  const MAX_MISSED = 2;

  const interval = setInterval(() => {
    if (socket.destroyed) {
      this.stopHeartbeat(cwd);
      return;
    }

    const pingId = randomUUID();
    const pingMsg = Buffer.from(
      JSON.stringify({ operationType: "__ping__", requestId: pingId })
    );

    const pongTimeout = setTimeout(() => {
      // Clean up from pendingRequests to avoid double-reject
      // from socket "close" handler
      this.pendingRequests.delete(pingId);
      missedPongs++;
      log("heartbeat: missed pong %d/%d", missedPongs, MAX_MISSED, { cwd });
      if (missedPongs >= MAX_MISSED && !wasUnresponsive) {
        wasUnresponsive = true;
        log("heartbeat: client unresponsive", { cwd });
        this.emit("client-unresponsive", cwd);
      }
    }, 5000);

    this.pendingRequests.set(pingId, {
      resolve: () => {
        clearTimeout(pongTimeout);
        missedPongs = 0;
        // Only emit on transition: unhealthy -> healthy
        if (wasUnresponsive) {
          wasUnresponsive = false;
          log("heartbeat: client recovered", { cwd });
          this.emit("client-responsive", cwd);
        }
      },
      reject: () => {
        clearTimeout(pongTimeout);
      },
      timeout: pongTimeout,
    });

    socket.write(pingMsg);
    socket.write("\n\n");
  }, intervalMs);

  this.heartbeatIntervals.set(cwd, interval);
}

private stopHeartbeat(cwd: string) {
  const interval = this.heartbeatIntervals.get(cwd);
  if (interval) {
    clearInterval(interval);
    this.heartbeatIntervals.delete(cwd);
  }
}
```

Key details:

- **Transition-only events**: `client-responsive` only fires on recovery from unresponsive state, not on every pong.
- **Cleans up `pendingRequests` on timeout**: Avoids double-reject from the `socket.on("close")` handler.
- **`wasUnresponsive` flag**: Prevents repeated `client-unresponsive` emissions for the same outage.

Start heartbeat when a client connects (inside the `socket.on("data")` handler, after cwd is set):

```typescript
if (currentCwd !== cwd) {
  if (currentCwd) {
    this.clients.delete(currentCwd);
    this.stopHeartbeat(currentCwd);
  }
  currentCwd = cwd;
  this.clients.set(cwd, socket);
  this.startHeartbeat(cwd, socket);
}
```

Clean up in `socket.on("close")`:

```typescript
socket.on("close", () => {
  if (currentCwd) {
    this.stopHeartbeat(currentCwd);
    this.clients.delete(currentCwd);
  }
  // ... existing pending request cleanup ...
});
```

#### Fallback: TCP keepalive (no extension changes needed)

Add OS-level TCP keepalive regardless of whether application-level heartbeat is implemented. This detects dead connections (process crash, network drop) but NOT a hung event loop:

```typescript
// In the server's connection handler, after socket is created:
socket.setKeepAlive(true, 15000);
```

This is a one-liner with zero dependencies — add it unconditionally.

#### 3b. Expose health status via oRPC

**`src/main/plugins/editor/router.ts`** — Track health per-cwd (not a single global boolean, since multiple projects can have different extension host states):

```typescript
const healthState = new Map<string, boolean>();

extBridge.on("client-unresponsive", (cwd: string) => {
  log("extension host unresponsive", { cwd });
  healthState.set(cwd, false);
});

extBridge.on("client-responsive", (cwd: string) => {
  log("extension host responsive", { cwd });
  healthState.set(cwd, true);
});
```

Add a contract method with cwd input:

```typescript
// shared/plugins/editor/contract.ts
health: oc.handler()
  .input(z.object({ cwd: z.string() }))
  .output(z.object({ healthy: z.boolean() })),
```

```typescript
// router.ts
health: orpcServer.handler(({ input }) => ({
  healthy: healthState.get(input.cwd) ?? true,
})),
```

#### 3c. Renderer: show health state

**`src/renderer/src/plugins/editor/editor-view.tsx`** — Poll health status and show a non-blocking warning banner:

```typescript
const [healthy, setHealthy] = useState(true);

useEffect(() => {
  if (!extReady || !cwd) return;
  const interval = setInterval(async () => {
    try {
      const result = await client.editor.health({ cwd });
      setHealthy(result.healthy);
    } catch {
      setHealthy(false);
    }
  }, 10000);
  return () => clearInterval(interval);
}, [extReady, cwd]);
```

Banner (above the iframe, not replacing it — the editor may still be partially functional):

```tsx
{
  !healthy && (
    <div className="bg-destructive/10 text-destructive text-sm px-3 py-1.5 text-center">
      Extension host is unresponsive. Editor features may be limited.
    </div>
  );
}
```

---

### Bonus: Fix event listener leak in editor-view.tsx

**Existing bug** at `editor-view.tsx:90`: The disposable cleanup uses `addEventListener` instead of `removeEventListener`, leaking listeners on every mount/unmount cycle:

```typescript
// Before (bug):
disposable.push(() => {
  window.addEventListener("neovate:open-editor", openEditorEvent);
});

// After (fix):
disposable.push(() => {
  window.removeEventListener("neovate:open-editor", openEditorEvent);
});
```

---

## Files Changed

| File                                              | Change                                                                                                                             |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/plugins/editor/utils/starter.ts`        | Scrub sensitive env vars before `wrapper.start()`, restore immediately after                                                       |
| `src/main/plugins/editor/utils/bridge.ts`         | Add `gracefulStop()` (uses `end()` not `destroy()`), `isStopped()`, heartbeat ping/pong with transition-only events, TCP keepalive |
| `src/main/plugins/editor/utils/index.ts`          | Guard double-stop in `CodeServerInstance.stop()`                                                                                   |
| `src/main/plugins/editor/index.ts`                | Use `async deactivate` + `gracefulStop()`                                                                                          |
| `src/main/plugins/editor/router.ts`               | Per-cwd health state tracking, add `health` handler                                                                                |
| `src/main/core/plugin/plugin-manager.ts`          | Reverse deactivation order (one-line change)                                                                                       |
| `src/shared/plugins/editor/contract.ts`           | Add `health` contract method (with cwd input)                                                                                      |
| `src/renderer/src/plugins/editor/editor-view.tsx` | Poll health + warning banner, fix `removeEventListener` bug                                                                        |
| neovate-code-extension (VSIX)                     | Add `__ping__` echo handler (**if feasible**; TCP keepalive covers basic liveness without this)                                    |

## Not in Scope

- **Auto-restart of code-server**: `wrapper.start()` runs in-process with no handle. True restart requires refactoring to spawn code-server as a child process. Worth doing eventually but a much larger change.
- **Filtering `process.env` in session-manager**: `session-manager.ts:381` spreads all of `process.env` into the SDK env. Could leak credentials if the SDK logs on error. Flagged as TODO for follow-up.
- **Exponential backoff on update checks (#1)**: Separate concern, different subsystem.
- **Duplicate log entries (#5)**: Likely a dual-webview or duplicate listener issue. Needs separate investigation.
- **File watch churn (#6)**: Should be addressed by adding `.sml/` and generated `types/` to the watcher exclude list. Separate fix.
