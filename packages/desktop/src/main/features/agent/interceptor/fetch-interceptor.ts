/**
 * Fetch interceptor — injected into the Claude Code CLI subprocess via
 * `bun --preload`. Monkey-patches globalThis.fetch to capture all Anthropic
 * API calls and emit them to the parent process over fd 3.
 *
 * This file is bundled with esbuild into a standalone JS file shipped
 * alongside the app. It must have zero runtime dependencies on the
 * Electron main process.
 */

import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { maskHeaders } from "./credential-mask";
import { StreamAssembler, parseSSEEvents } from "./stream-assembler";

// Lightweight debug logger — no dependency on the `debug` package.
// Enable via DEBUG=neovate:interceptor* or NV_DEBUG=1 env var.
const DEBUG_ENABLED =
  process.env.NV_DEBUG === "1" || (process.env.DEBUG ?? "").includes("neovate:interceptor");
function dlog(...args: unknown[]) {
  if (DEBUG_ENABLED) console.error("[neovate:interceptor]", ...args);
}

// ── Guards ──────────────────────────────────────────────────────────

if ((globalThis as any).__nvInterceptorInstalled) {
  dlog("skip: already installed");
} else {
  (globalThis as any).__nvInterceptorInstalled = true;
  setup();
}

// ── Setup ───────────────────────────────────────────────────────────

function setup() {
  const originalFetch = globalThis.fetch;
  const sessionId = process.env.NV_SESSION_ID ?? "";
  const customBaseURL = process.env.ANTHROPIC_BASE_URL ?? "";
  const fd = 3;
  let ipcAlive = true;

  dlog("setup: sessionId=%s customBaseURL=%s", sessionId, customBaseURL || "(default)");

  // Ready handshake — parent waits for this to confirm interceptor loaded
  try {
    fs.writeSync(fd, "__NV_READY\n");
    dlog("handshake sent");
  } catch {
    ipcAlive = false;
    dlog("handshake FAILED — fd 3 not open, disabling");
  }

  // ── Emitters ────────────────────────────────────────────────────

  function emitSync(data: Record<string, unknown>): void {
    if (!ipcAlive) return;
    try {
      fs.writeSync(fd, `__NV_REQ:${JSON.stringify(data)}\n`);
    } catch {
      ipcAlive = false;
      globalThis.fetch = originalFetch;
    }
  }

  function emitAsync(data: Record<string, unknown>): void {
    if (!ipcAlive) return;
    try {
      const line = `__NV_REQ:${JSON.stringify(data)}\n`;
      fs.write(fd, line, (err) => {
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

  // ── URL matching ────────────────────────────────────────────────

  function isAnthropicURL(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.hostname.includes("anthropic") || u.hostname.includes("claude")) return true;
      if (u.pathname.startsWith("/v1/messages")) return true;
      if (u.pathname.startsWith("/api/eval/sdk-")) return true;
      if (customBaseURL) {
        const base = new URL(customBaseURL);
        if (u.hostname === base.hostname && u.port === base.port) return true;
      }
    } catch {
      // Fallback: string matching for relative URLs or malformed
      if (url.includes("anthropic") || url.includes("claude")) return true;
    }
    return false;
  }

  // ── Header matching (case-insensitive) ─────────────────────────

  function hasAnthropicHeaders(headers: Record<string, string>): boolean {
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "anthropic-version" || lower === "x-api-key") return true;
    }
    return false;
  }

  // ── Header extraction ───────────────────────────────────────────

  function extractHeaders(init?: RequestInit): Record<string, string> {
    const raw: Record<string, string> = {};
    const h = init?.headers;
    if (!h) return raw;
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        raw[k] = v;
      });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h) raw[k] = v;
    } else {
      Object.assign(raw, h);
    }
    return raw;
  }

  // ── Fetch patch ─────────────────────────────────────────────────

  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    if (!ipcAlive) {
      return originalFetch.apply(this, arguments as any);
    }

    // Fast path: URL matches known Anthropic patterns
    if (!isAnthropicURL(url)) {
      // Slow path: custom provider URL — check for Anthropic-specific headers
      if (!hasAnthropicHeaders(extractHeaders(init))) {
        return originalFetch.apply(this, arguments as any);
      }
    }

    const id = randomUUID();
    const method = init?.method ?? "GET";
    const startTime = Date.now();
    dlog("intercept: %s %s id=%s", method, url, id);
    const rawHeaders = extractHeaders(init);
    const maskedHdrs = maskHeaders(rawHeaders);

    // Zero-copy: grab raw body string from fetch options
    const rawBody = typeof init?.body === "string" ? init.body : "";

    // Parse once for summary extraction
    let parsed: any = null;
    try {
      if (rawBody) parsed = JSON.parse(rawBody);
    } catch {
      // not JSON
    }

    const summaryBase = {
      id,
      sessionId,
      url,
      method,
      model: parsed?.model,
      isStream: parsed?.stream === true,
      headers: maskedHdrs,
      messageCount: Array.isArray(parsed?.messages) ? parsed.messages.length : undefined,
      toolNames: Array.isArray(parsed?.tools)
        ? parsed.tools.map((t: any) => t.name).filter(Boolean)
        : undefined,
      systemPromptLength:
        typeof parsed?.system === "string"
          ? parsed.system.length
          : Array.isArray(parsed?.system)
            ? JSON.stringify(parsed.system).length
            : undefined,
      maxTokens: parsed?.max_tokens,
    };

    // Emit start (summary only, sync, small)
    dlog(
      "start: id=%s model=%s stream=%s msgs=%s tools=%s",
      id,
      parsed?.model,
      parsed?.stream,
      summaryBase.messageCount,
      summaryBase.toolNames?.length,
    );
    emitSync({ ...summaryBase, phase: "start", timestamp: startTime });

    // Execute original fetch
    let response: Response;
    try {
      response = await originalFetch.apply(this, arguments as any);
    } catch (err: any) {
      const duration = Date.now() - startTime;
      dlog("fetch error: id=%s duration=%dms error=%s", id, duration, err?.message);
      emitAsync({
        ...summaryBase,
        phase: "end",
        timestamp: Date.now(),
        duration,
        error: err?.message ?? "fetch failed",
        detail: {
          request: { headers: maskedHdrs, rawBody },
        },
      });
      throw err;
    }

    const respHeaders: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });

    dlog(
      "response: id=%s status=%d stream=%s",
      id,
      response.status,
      !!(parsed?.stream && response.body),
    );

    // Stream response — only when the server actually streams (2xx).
    // Error responses (403, 429, 500, etc.) are always plain JSON, never SSE.
    if (parsed?.stream && response.body && response.ok) {
      return handleStreamResponse(
        response,
        id,
        summaryBase,
        maskedHdrs,
        rawBody,
        respHeaders,
        startTime,
      );
    }

    // Non-stream response
    return handleNonStreamResponse(
      response,
      id,
      summaryBase,
      maskedHdrs,
      rawBody,
      respHeaders,
      startTime,
    );
  };

  // ── Stream handler ──────────────────────────────────────────────

  function handleStreamResponse(
    response: Response,
    _id: string,
    summaryBase: Record<string, unknown>,
    maskedHdrs: Record<string, string>,
    rawBody: string,
    respHeaders: Record<string, string>,
    startTime: number,
  ): Response {
    dlog("stream start: id=%s", summaryBase.id);
    const assembler = new StreamAssembler();
    let streamedContent = "";

    const original = response.body!;
    const reader = original.getReader();
    const decoder = new TextDecoder();

    const passThrough = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();

            // Assemble and emit
            const events = parseSSEEvents(streamedContent);
            for (const event of events) {
              assembler.processEvent(event);
            }
            const assembled = assembler.finalize();
            const duration = Date.now() - startTime;
            const usage = assembled.usage;
            const contentBlockTypes = Array.isArray(assembled.content)
              ? [...new Set(assembled.content.map((b: any) => b?.type).filter(Boolean))]
              : undefined;

            dlog(
              "stream end: id=%s duration=%dms events=%d blocks=%d stop=%s in=%d out=%d",
              summaryBase.id,
              duration,
              events.length,
              assembled.content?.length ?? 0,
              assembled.stop_reason,
              usage?.input_tokens ?? 0,
              usage?.output_tokens ?? 0,
            );

            emitAsync({
              ...summaryBase,
              phase: "end",
              timestamp: Date.now(),
              status: response.status,
              duration,
              responseHeaders: respHeaders,
              stopReason: assembled.stop_reason,
              usage: usage
                ? {
                    inputTokens: usage.input_tokens ?? 0,
                    outputTokens: usage.output_tokens ?? 0,
                    cacheReadInputTokens: usage.cache_read_input_tokens,
                    cacheCreationInputTokens: usage.cache_creation_input_tokens,
                  }
                : undefined,
              contentBlockTypes,
              detail: {
                request: { headers: maskedHdrs, rawBody },
                response: { headers: respHeaders, body: assembled },
              },
            });
            return;
          }

          // Forward bytes and accumulate for assembly
          controller.enqueue(value);
          streamedContent += decoder.decode(value, { stream: true });
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel();
      },
    });

    return new Response(passThrough, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  // ── Non-stream handler ──────────────────────────────────────────

  async function handleNonStreamResponse(
    response: Response,
    _id: string,
    summaryBase: Record<string, unknown>,
    maskedHdrs: Record<string, string>,
    rawBody: string,
    respHeaders: Record<string, string>,
    startTime: number,
  ): Promise<Response> {
    const cloned = response.clone();
    let respBody: unknown;
    try {
      const text = await cloned.text();
      try {
        respBody = JSON.parse(text);
      } catch {
        respBody = text.slice(0, 2000);
      }
    } catch {
      respBody = "[failed to read response body]";
    }

    const duration = Date.now() - startTime;
    const usage =
      respBody && typeof respBody === "object" && "usage" in respBody
        ? (respBody as any).usage
        : undefined;

    dlog(
      "non-stream end: id=%s status=%d duration=%dms",
      summaryBase.id,
      response.status,
      duration,
    );

    emitAsync({
      ...summaryBase,
      phase: "end",
      timestamp: Date.now(),
      status: response.status,
      duration,
      responseHeaders: respHeaders,
      stopReason:
        respBody && typeof respBody === "object" && "stop_reason" in respBody
          ? (respBody as any).stop_reason
          : undefined,
      usage: usage
        ? {
            inputTokens: usage.input_tokens ?? 0,
            outputTokens: usage.output_tokens ?? 0,
            cacheReadInputTokens: usage.cache_read_input_tokens,
            cacheCreationInputTokens: usage.cache_creation_input_tokens,
          }
        : undefined,
      detail: {
        request: { headers: maskedHdrs, rawBody },
        response: { headers: respHeaders, body: respBody },
      },
    });

    return response;
  }
}
