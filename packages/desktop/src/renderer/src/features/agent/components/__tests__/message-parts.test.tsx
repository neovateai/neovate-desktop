import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MessageParts } from "../message-parts";
import { ClaudeCodeToolUIPart } from "../tool-parts";

describe("MessageParts", () => {
  it("renders agent UIMessage output directly from the parent Agent tool", () => {
    const agentMessage = {
      id: "agent:call-agent",
      role: "assistant",
      metadata: { sessionId: "sess-1", parentToolUseId: null },
      parts: [
        { type: "text", text: "Inspection in progress", state: "done" },
        {
          type: "tool-Read",
          toolCallId: "call-read",
          state: "output-available",
          input: { file_path: "/tmp/subagent-example.ts", limit: 50 },
          output: "export const subagentResult = true;",
          providerExecuted: true,
        },
        { type: "text", text: "Inspection complete", state: "done" },
      ],
    } as any;

    const message = {
      id: "parent-msg",
      role: "assistant",
      metadata: { sessionId: "sess-1", parentToolUseId: null },
      parts: [
        {
          type: "tool-Agent",
          toolCallId: "call-agent",
          state: "output-available",
          input: {
            description: "Explore repo",
            prompt: "Inspect the codebase",
            subagent_type: "Explore",
          },
          output: agentMessage,
          providerExecuted: true,
        },
      ],
    } as any;

    const html = renderToStaticMarkup(
      <MessageParts
        message={message}
        renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
      />,
    );

    expect(html).toContain("Inspection in progress");
    expect(html).toContain("subagent-example.ts");
    expect(html).toContain("Inspection complete");
  });
});
