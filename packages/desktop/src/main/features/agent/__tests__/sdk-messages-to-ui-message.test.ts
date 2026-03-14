import { describe, expect, it } from "vitest";

import { sdkMessagesToUIMessage } from "../utils/sdk-messages-to-ui-message";

const makeAssistantToolUse = () =>
  ({
    type: "assistant" as const,
    uuid: "assistant-1",
    session_id: "sess-1",
    parent_tool_use_id: null,
    error: null,
    message: {
      id: "msg-1",
      role: "assistant" as const,
      content: [
        {
          type: "tool_use" as const,
          id: "call-read",
          name: "Read",
          input: { file_path: "/tmp/a.ts" },
        },
      ],
      model: "claude-3",
      stop_reason: "end_turn",
      stop_sequence: null,
      type: "message" as const,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
  }) as const;

const makeUserToolResult = () =>
  ({
    type: "user" as const,
    uuid: "user-1",
    session_id: "sess-1",
    parent_tool_use_id: null,
    message: {
      role: "user" as const,
      content: [
        {
          type: "tool_result" as const,
          tool_use_id: "call-read",
          content: "export const ok = true;",
          is_error: false,
        },
      ],
    },
  }) as const;

describe("sdkMessagesToUIMessage", () => {
  it("replays SDK messages into one assistant UIMessage", async () => {
    const message = await sdkMessagesToUIMessage([
      makeAssistantToolUse(),
      makeUserToolResult(),
    ] as any);

    expect(message?.parts.find((part: any) => part.type === "tool-Read")).toMatchObject({
      toolCallId: "call-read",
      state: "output-available",
      output: "export const ok = true;",
    });
  });
});
