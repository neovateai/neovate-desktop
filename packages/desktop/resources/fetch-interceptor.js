// src/main/features/agent/interceptor/fetch-interceptor.ts
import { randomUUID } from "node:crypto";
import fs from "node:fs";

// src/main/features/agent/interceptor/credential-mask.ts
var SENSITIVE_HEADERS = new Set(["x-api-key", "authorization"]);
function maskCredential(value) {
  if (value.startsWith("Bearer ")) {
    return `Bearer ${maskCredential(value.slice(7))}`;
  }
  if (value.startsWith("sk-")) {
    const prefix = value.slice(0, 6);
    const suffix = value.slice(-3);
    return `${prefix}****${suffix}`;
  }
  return value;
}
function maskHeaders(headers) {
  const masked = {};
  for (const [key, val] of Object.entries(headers)) {
    masked[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? maskCredential(val) : val;
  }
  return masked;
}

// src/main/features/agent/interceptor/stream-assembler.ts
class StreamAssembler {
  message = {};
  contentBlocks = [];
  activeBlockIndex = -1;
  inputJsonBuffer = "";
  processEvent(event) {
    switch (event.type) {
      case "message_start":
        this.handleMessageStart(event);
        break;
      case "content_block_start":
        this.handleContentBlockStart(event);
        break;
      case "content_block_delta":
        this.handleContentBlockDelta(event);
        break;
      case "content_block_stop":
        this.handleContentBlockStop(event);
        break;
      case "message_delta":
        this.handleMessageDelta(event);
        break;
      case "message_stop":
        break;
    }
  }
  finalize() {
    return { ...this.message, content: this.contentBlocks };
  }
  handleMessageStart(event) {
    const msg = event.message;
    if (msg == null || typeof msg !== "object")
      return;
    this.message = {
      id: msg.id,
      type: msg.type ?? "message",
      role: msg.role ?? "assistant",
      model: msg.model,
      stop_reason: msg.stop_reason ?? null,
      stop_sequence: msg.stop_sequence ?? null,
      usage: msg.usage ? { ...msg.usage } : { input_tokens: 0, output_tokens: 0 }
    };
    this.contentBlocks = [];
  }
  handleContentBlockStart(event) {
    const block = event.content_block;
    if (block == null || typeof block !== "object")
      return;
    const index = typeof event.index === "number" ? event.index : this.contentBlocks.length;
    switch (block.type) {
      case "text":
        this.setBlock(index, { type: "text", text: block.text ?? "" });
        break;
      case "thinking":
        this.setBlock(index, {
          type: "thinking",
          thinking: block.thinking ?? "",
          signature: block.signature ?? ""
        });
        break;
      case "redacted_thinking":
        this.setBlock(index, { type: "redacted_thinking", data: block.data ?? "" });
        break;
      case "tool_use":
        this.setBlock(index, {
          type: "tool_use",
          id: block.id ?? "",
          name: block.name ?? "",
          input: {}
        });
        this.inputJsonBuffer = "";
        break;
      default:
        this.setBlock(index, { ...block });
        break;
    }
    this.activeBlockIndex = index;
  }
  handleContentBlockDelta(event) {
    const delta = event.delta;
    if (delta == null || typeof delta !== "object")
      return;
    const index = typeof event.index === "number" ? event.index : this.activeBlockIndex;
    const block = this.contentBlocks[index];
    if (block == null)
      return;
    switch (delta.type) {
      case "text_delta":
        if (block.type === "text" && typeof delta.text === "string") {
          block.text += delta.text;
        }
        break;
      case "thinking_delta":
        if (block.type === "thinking" && typeof delta.thinking === "string") {
          block.thinking += delta.thinking;
        }
        break;
      case "input_json_delta":
        if (block.type === "tool_use" && typeof delta.partial_json === "string") {
          this.inputJsonBuffer += delta.partial_json;
        }
        break;
      case "signature_delta":
        if (block.type === "thinking" && typeof delta.signature === "string") {
          block.signature = delta.signature;
        }
        break;
    }
  }
  handleContentBlockStop(event) {
    const index = typeof event.index === "number" ? event.index : this.activeBlockIndex;
    const block = this.contentBlocks[index];
    if (block != null && block.type === "tool_use") {
      if (this.inputJsonBuffer.length > 0) {
        try {
          block.input = JSON.parse(this.inputJsonBuffer);
        } catch {
          block.input = this.inputJsonBuffer;
        }
      }
      this.inputJsonBuffer = "";
    }
    this.activeBlockIndex = -1;
  }
  handleMessageDelta(event) {
    const delta = event.delta;
    if (delta != null && typeof delta === "object") {
      if (delta.stop_reason !== undefined) {
        this.message.stop_reason = delta.stop_reason;
      }
      if (delta.stop_sequence !== undefined) {
        this.message.stop_sequence = delta.stop_sequence;
      }
    }
    const usage = event.usage;
    if (usage != null && typeof usage === "object") {
      if (this.message.usage == null) {
        this.message.usage = {};
      }
      for (const key of Object.keys(usage)) {
        const value = usage[key];
        if (typeof value === "number") {
          this.message.usage[key] = value;
        } else if (value != null && typeof value === "object") {
          this.message.usage[key] = { ...this.message.usage[key], ...value };
        }
      }
    }
  }
  setBlock(index, block) {
    while (this.contentBlocks.length <= index) {
      this.contentBlocks.push(null);
    }
    this.contentBlocks[index] = block;
  }
}
function parseSSEEvents(rawText) {
  const results = [];
  const blocks = rawText.split(`

`);
  for (const block of blocks) {
    const trimmed = block.trim();
    if (trimmed.length === 0)
      continue;
    let eventType;
    let dataStr;
    const lines = trimmed.split(`
`);
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventType = line.slice("event:".length).trim();
      } else if (line.startsWith("data:")) {
        const value = line.slice("data:".length).trim();
        dataStr = dataStr == null ? value : dataStr + `
` + value;
      }
    }
    if (dataStr === "[DONE]")
      continue;
    if (dataStr == null || dataStr.length === 0)
      continue;
    try {
      const parsed = JSON.parse(dataStr);
      if (parsed != null && typeof parsed === "object") {
        const type = eventType ?? parsed.type;
        if (typeof type === "string") {
          results.push({ ...parsed, type });
        }
      }
    } catch {}
  }
  return results;
}

// src/main/features/agent/interceptor/fetch-interceptor.ts
var DEBUG_ENABLED = process.env.NV_DEBUG === "1" || (process.env.DEBUG ?? "").includes("neovate:interceptor");
function dlog(...args) {
  if (DEBUG_ENABLED)
    console.error("[neovate:interceptor]", ...args);
}
if (globalThis.__nvInterceptorInstalled) {
  dlog("skip: already installed");
} else {
  globalThis.__nvInterceptorInstalled = true;
  setup();
}
function setup() {
  const originalFetch = globalThis.fetch;
  const sessionId = process.env.NV_SESSION_ID ?? "";
  const customBaseURL = process.env.ANTHROPIC_BASE_URL ?? "";
  const fd = 3;
  let ipcAlive = true;
  dlog("setup: sessionId=%s customBaseURL=%s", sessionId, customBaseURL || "(default)");
  try {
    fs.writeSync(fd, `__NV_READY
`);
    dlog("handshake sent");
  } catch {
    ipcAlive = false;
    dlog("handshake FAILED — fd 3 not open, disabling");
  }
  function emitSync(data) {
    if (!ipcAlive)
      return;
    try {
      fs.writeSync(fd, `__NV_REQ:${JSON.stringify(data)}
`);
    } catch {
      ipcAlive = false;
      globalThis.fetch = originalFetch;
    }
  }
  function emitAsync(data) {
    if (!ipcAlive)
      return;
    try {
      const line = `__NV_REQ:${JSON.stringify(data)}
`;
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
  function isAnthropicURL(url) {
    try {
      const u = new URL(url);
      if (u.hostname.includes("anthropic") || u.hostname.includes("claude"))
        return true;
      if (u.pathname.startsWith("/v1/messages"))
        return true;
      if (u.pathname.startsWith("/api/eval/sdk-"))
        return true;
      if (customBaseURL) {
        const base = new URL(customBaseURL);
        if (u.hostname === base.hostname && u.port === base.port)
          return true;
      }
    } catch {
      if (url.includes("anthropic") || url.includes("claude"))
        return true;
    }
    return false;
  }
  function hasAnthropicHeaders(headers) {
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "anthropic-version" || lower === "x-api-key")
        return true;
    }
    return false;
  }
  function extractHeaders(init) {
    const raw = {};
    const h = init?.headers;
    if (!h)
      return raw;
    if (h instanceof Headers) {
      h.forEach((v, k) => {
        raw[k] = v;
      });
    } else if (Array.isArray(h)) {
      for (const [k, v] of h)
        raw[k] = v;
    } else {
      Object.assign(raw, h);
    }
    return raw;
  }
  globalThis.fetch = async function patchedFetch(input, init) {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!ipcAlive) {
      return originalFetch.apply(this, arguments);
    }
    if (!isAnthropicURL(url)) {
      if (!hasAnthropicHeaders(extractHeaders(init))) {
        return originalFetch.apply(this, arguments);
      }
    }
    const id = randomUUID();
    const method = init?.method ?? "GET";
    const startTime = Date.now();
    dlog("intercept: %s %s id=%s", method, url, id);
    const rawHeaders = extractHeaders(init);
    const maskedHdrs = maskHeaders(rawHeaders);
    const rawBody = typeof init?.body === "string" ? init.body : "";
    let parsed = null;
    try {
      if (rawBody)
        parsed = JSON.parse(rawBody);
    } catch {}
    const summaryBase = {
      id,
      sessionId,
      url,
      method,
      model: parsed?.model,
      isStream: parsed?.stream === true,
      headers: maskedHdrs,
      messageCount: Array.isArray(parsed?.messages) ? parsed.messages.length : undefined,
      toolNames: Array.isArray(parsed?.tools) ? parsed.tools.map((t) => t.name).filter(Boolean) : undefined,
      systemPromptLength: typeof parsed?.system === "string" ? parsed.system.length : Array.isArray(parsed?.system) ? JSON.stringify(parsed.system).length : undefined,
      maxTokens: parsed?.max_tokens
    };
    dlog("start: id=%s model=%s stream=%s msgs=%s tools=%s", id, parsed?.model, parsed?.stream, summaryBase.messageCount, summaryBase.toolNames?.length);
    emitSync({ ...summaryBase, phase: "start", timestamp: startTime });
    let response;
    try {
      response = await originalFetch.apply(this, arguments);
    } catch (err) {
      const duration = Date.now() - startTime;
      dlog("fetch error: id=%s duration=%dms error=%s", id, duration, err?.message);
      emitAsync({
        ...summaryBase,
        phase: "end",
        timestamp: Date.now(),
        duration,
        error: err?.message ?? "fetch failed",
        detail: {
          request: { headers: maskedHdrs, rawBody }
        }
      });
      throw err;
    }
    const respHeaders = {};
    response.headers.forEach((v, k) => {
      respHeaders[k] = v;
    });
    dlog("response: id=%s status=%d stream=%s", id, response.status, !!(parsed?.stream && response.body));
    if (parsed?.stream && response.body && response.ok) {
      return handleStreamResponse(response, id, summaryBase, maskedHdrs, rawBody, respHeaders, startTime);
    }
    return handleNonStreamResponse(response, id, summaryBase, maskedHdrs, rawBody, respHeaders, startTime);
  };
  function handleStreamResponse(response, _id, summaryBase, maskedHdrs, rawBody, respHeaders, startTime) {
    dlog("stream start: id=%s", summaryBase.id);
    const assembler = new StreamAssembler;
    let streamedContent = "";
    const original = response.body;
    const reader = original.getReader();
    const decoder = new TextDecoder;
    const passThrough = new ReadableStream({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            controller.close();
            const events = parseSSEEvents(streamedContent);
            for (const event of events) {
              assembler.processEvent(event);
            }
            const assembled = assembler.finalize();
            const duration = Date.now() - startTime;
            const usage = assembled.usage;
            const contentBlockTypes = Array.isArray(assembled.content) ? [...new Set(assembled.content.map((b) => b?.type).filter(Boolean))] : undefined;
            dlog("stream end: id=%s duration=%dms events=%d blocks=%d stop=%s in=%d out=%d", summaryBase.id, duration, events.length, assembled.content?.length ?? 0, assembled.stop_reason, usage?.input_tokens ?? 0, usage?.output_tokens ?? 0);
            emitAsync({
              ...summaryBase,
              phase: "end",
              timestamp: Date.now(),
              status: response.status,
              duration,
              responseHeaders: respHeaders,
              stopReason: assembled.stop_reason,
              usage: usage ? {
                inputTokens: usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
                cacheReadInputTokens: usage.cache_read_input_tokens,
                cacheCreationInputTokens: usage.cache_creation_input_tokens
              } : undefined,
              contentBlockTypes,
              detail: {
                request: { headers: maskedHdrs, rawBody },
                response: { headers: respHeaders, body: assembled }
              }
            });
            return;
          }
          controller.enqueue(value);
          streamedContent += decoder.decode(value, { stream: true });
        } catch (err) {
          controller.error(err);
        }
      },
      cancel() {
        reader.cancel();
      }
    });
    return new Response(passThrough, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }
  async function handleNonStreamResponse(response, _id, summaryBase, maskedHdrs, rawBody, respHeaders, startTime) {
    const cloned = response.clone();
    let respBody;
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
    const usage = respBody && typeof respBody === "object" && "usage" in respBody ? respBody.usage : undefined;
    dlog("non-stream end: id=%s status=%d duration=%dms", summaryBase.id, response.status, duration);
    emitAsync({
      ...summaryBase,
      phase: "end",
      timestamp: Date.now(),
      status: response.status,
      duration,
      responseHeaders: respHeaders,
      stopReason: respBody && typeof respBody === "object" && "stop_reason" in respBody ? respBody.stop_reason : undefined,
      usage: usage ? {
        inputTokens: usage.input_tokens ?? 0,
        outputTokens: usage.output_tokens ?? 0,
        cacheReadInputTokens: usage.cache_read_input_tokens,
        cacheCreationInputTokens: usage.cache_creation_input_tokens
      } : undefined,
      detail: {
        request: { headers: maskedHdrs, rawBody },
        response: { headers: respHeaders, body: respBody }
      }
    });
    return response;
  }
}
