import { createUIMessageStream, readUIMessageStream } from "ai";
import { describe, expect, it } from "vitest";

import type { ClaudeCodeUIMessage } from "../../../../shared/claude-code/types";

import { SDKMessageTransformer } from "../sdk-message-transformer";

const makeAssistantMsg = (id: string, content: any[], parentToolUseId: string | null = null) => ({
  type: "assistant" as const,
  uuid: crypto.randomUUID(),
  session_id: "sess-1",
  parent_tool_use_id: parentToolUseId,
  error: null,
  message: {
    id,
    role: "assistant" as const,
    content,
    model: "claude-3",
    stop_reason: "end_turn",
    stop_sequence: null,
    type: "message" as const,
    usage: { input_tokens: 10, output_tokens: 5 },
  },
});

const makeUserMsg = (content: any, parentToolUseId: string | null = null) => ({
  type: "user" as const,
  uuid: crypto.randomUUID(),
  session_id: "sess-1",
  parent_tool_use_id: parentToolUseId,
  message: {
    role: "user" as const,
    content,
  },
});

async function replayToLastMessage(messages: any[]) {
  const transformer = new SDKMessageTransformer();
  const stream = createUIMessageStream<ClaudeCodeUIMessage>({
    async execute({ writer }) {
      for (const message of messages) {
        for await (const chunk of transformer.transformWithAggregation(message)) {
          writer.write(chunk);
        }
      }
    },
  });

  let lastMessage: ClaudeCodeUIMessage | undefined;
  for await (const message of readUIMessageStream<ClaudeCodeUIMessage>({ stream })) {
    lastMessage = message;
  }

  return lastMessage;
}

describe("Task/SubAgent aggregation", () => {
  it("emits an agent UIMessage as the parent Agent tool output", async () => {
    const message = await replayToLastMessage([
      makeAssistantMsg("msg-parent", [
        {
          type: "tool_use",
          id: "call-agent",
          name: "Agent",
          input: {
            description: "Explore repo",
            prompt: "Inspect the codebase",
            subagent_type: "Explore",
          },
        },
      ]),
      makeUserMsg([{ type: "text", text: "Inspect the codebase" }], "call-agent"),
      makeAssistantMsg(
        "msg-child-read",
        [
          {
            type: "tool_use",
            id: "call-read",
            name: "Read",
            input: { file_path: "/tmp/subagent-example.ts", limit: 50 },
          },
        ],
        "call-agent",
      ),
      makeUserMsg(
        [
          {
            type: "tool_result",
            tool_use_id: "call-read",
            content: "export const subagentResult = true;",
            is_error: false,
          },
        ],
        "call-agent",
      ),
      makeUserMsg([
        {
          type: "tool_result",
          tool_use_id: "call-agent",
          content: {
            result: "Inspection complete",
            agentId: "agent-1",
          },
          is_error: false,
        },
      ]),
    ]);

    const parentAgentPart = message?.parts.find((part: any) => part.type === "tool-Agent") as any;

    expect(parentAgentPart?.toolCallId).toBe("call-agent");
    expect(parentAgentPart?.output?.id).toBe("agent:call-agent");
    expect(parentAgentPart?.output?.role).toBe("assistant");
    expect(Array.isArray(parentAgentPart?.output?.parts)).toBe(true);
    expect(parentAgentPart?.output.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-Read",
          input: expect.objectContaining({ file_path: "/tmp/subagent-example.ts" }),
        }),
        expect.objectContaining({
          type: "text",
          text: "Inspection complete",
        }),
      ]),
    );
  });

  it("preserves output-error when the parent Agent tool result fails", async () => {
    const message = await replayToLastMessage([
      makeAssistantMsg("msg-parent", [
        {
          type: "tool_use",
          id: "call-agent",
          name: "Agent",
          input: {
            description: "Explore repo",
            prompt: "Inspect the codebase",
            subagent_type: "Explore",
          },
        },
      ]),
      makeUserMsg([{ type: "text", text: "Inspect the codebase" }], "call-agent"),
      makeAssistantMsg(
        "msg-child-read",
        [
          {
            type: "tool_use",
            id: "call-read",
            name: "Read",
            input: { file_path: "/tmp/subagent-example.ts", limit: 50 },
          },
        ],
        "call-agent",
      ),
      makeUserMsg(
        [
          {
            type: "tool_result",
            tool_use_id: "call-read",
            content: "export const subagentResult = true;",
            is_error: false,
          },
        ],
        "call-agent",
      ),
      makeUserMsg([
        {
          type: "tool_result",
          tool_use_id: "call-agent",
          content: { result: "Inspection failed" },
          is_error: true,
        },
      ]),
    ]);

    const parentAgentPart = message?.parts.find((part: any) => part.type === "tool-Agent") as any;

    expect(parentAgentPart?.toolCallId).toBe("call-agent");
    expect(parentAgentPart?.state).toBe("output-error");
    expect(parentAgentPart?.errorText).toContain("Inspection failed");
  });
});
