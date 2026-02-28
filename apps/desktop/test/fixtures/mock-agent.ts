#!/usr/bin/env node

/**
 * Mock ACP agent for integration tests.
 * Speaks ACP over stdin/stdout ndjson.
 *
 * Behavior controlled by env vars:
 *   MOCK_EMIT_PERMISSION=1  — emit a permission request during prompt
 *   MOCK_EMIT_TOOL_CALL=1   — emit a tool_call + tool_call_update during prompt
 *   MOCK_DELAY_MS=50         — delay between events (default: 10)
 */

import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
  type CancelNotification,
} from "@agentclientprotocol/sdk";
import { Writable, Readable } from "node:stream";

const DELAY = Number(process.env.MOCK_DELAY_MS ?? 10);
const EMIT_PERMISSION = process.env.MOCK_EMIT_PERMISSION === "1";
const EMIT_TOOL_CALL = process.env.MOCK_EMIT_TOOL_CALL === "1";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let sessionCounter = 0;

class MockAgent implements Agent {
  private connection: AgentSideConnection;
  private pendingPrompts = new Map<string, AbortController>();

  constructor(connection: AgentSideConnection) {
    this.connection = connection;
  }

  async initialize(_params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: {},
    };
  }

  async newSession(_params: NewSessionRequest): Promise<NewSessionResponse> {
    const sessionId = `mock-session-${++sessionCounter}`;
    return { sessionId };
  }

  async authenticate(): Promise<void> {
    return;
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const ac = new AbortController();
    this.pendingPrompts.set(params.sessionId, ac);

    try {
      // Emit a text chunk
      await this.connection.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello from mock agent!" },
        },
      });

      await delay(DELAY);
      if (ac.signal.aborted) return { stopReason: "cancelled" };

      if (EMIT_TOOL_CALL) {
        await this.connection.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId: "tc-1",
            title: "Mock tool call",
            kind: "read",
            status: "pending",
          },
        });

        await delay(DELAY);
        if (ac.signal.aborted) return { stopReason: "cancelled" };

        await this.connection.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId: "tc-1",
            status: "completed",
          },
        });

        await delay(DELAY);
        if (ac.signal.aborted) return { stopReason: "cancelled" };
      }

      if (EMIT_PERMISSION) {
        const response = await this.connection.requestPermission({
          sessionId: params.sessionId,
          toolCall: {
            toolCallId: "tc-perm",
            title: "Mock permission",
            kind: "edit",
            status: "pending",
          },
          options: [
            { kind: "allow_once", name: "Allow", optionId: "allow" },
            { kind: "reject_once", name: "Deny", optionId: "deny" },
          ],
        });

        if (response.outcome.outcome === "cancelled") {
          return { stopReason: "cancelled" };
        }

        await this.connection.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: {
              type: "text",
              text: ` Permission ${response.outcome.outcome === "selected" ? response.outcome.optionId : "cancelled"}.`,
            },
          },
        });
      }

      // Final text chunk
      await this.connection.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: " Done." },
        },
      });

      return { stopReason: "end_turn" };
    } finally {
      this.pendingPrompts.delete(params.sessionId);
    }
  }

  async cancel(params: CancelNotification): Promise<void> {
    this.pendingPrompts.get(params.sessionId)?.abort();
  }
}

const input = Writable.toWeb(process.stdout);
const output = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;

const stream = ndJsonStream(input, output);
new AgentSideConnection((conn) => new MockAgent(conn), stream);
