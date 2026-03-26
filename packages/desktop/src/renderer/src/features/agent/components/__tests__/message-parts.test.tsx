// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../orpc", () => ({ client: {} }));
vi.mock("../../../../core/app", () => ({
  useRendererApp: () => ({ opener: { open: vi.fn() } }),
}));
vi.mock("../../hooks/use-markdown-components", async () => {
  const { markdownBaseComponents } =
    await import("../../../../components/ai-elements/markdown-base-components");
  return { useMarkdownComponents: () => markdownBaseComponents };
});

import { MessageParts } from "../message-parts";
import { ClaudeCodeToolUIPart } from "../tool-parts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, number | string>) => {
      if (key === "chat.messages.summaryMessagesOnly") {
        return `${params?.messageCount} messages`;
      }
      if (key === "chat.messages.summaryToolsOnly") {
        return `${params?.toolCallCount} tool calls`;
      }
      if (key === "chat.messages.summaryReasoningOnly") {
        return `${params?.reasoningCount} thoughts`;
      }
      if (key === "chat.messages.summarySeparator") {
        return ", ";
      }
      return key;
    },
  }),
}));

afterEach(() => {
  cleanup();
});

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

    render(
      <MessageParts
        message={message}
        renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
      />,
    );

    expect(screen.getByText("Inspection in progress")).toBeTruthy();
    expect(screen.getByText("subagent-example.ts")).toBeTruthy();
    expect(screen.getByText("Inspection complete")).toBeTruthy();
  });

  it("does not collapse restored assistant replies that only contain ordinary text", () => {
    const message = {
      id: "restored-text-only",
      role: "assistant",
      metadata: { deliveryMode: "restored" },
      parts: [
        { type: "text", text: "第一段回复", state: "done" },
        { type: "text", text: "第二段回复", state: "done" },
      ],
    } as any;

    render(
      <MessageParts
        message={message}
        renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
      />,
    );

    expect(screen.getByText("第一段回复")).toBeTruthy();
    expect(screen.getByText("第二段回复")).toBeTruthy();
    expect(screen.queryByText("1 messages")).toBeNull();
  });

  it("does not render a status dot for preliminary agent output", () => {
    const message = {
      id: "preliminary-agent",
      role: "assistant",
      metadata: { sessionId: "sess-2", parentToolUseId: null },
      parts: [
        {
          type: "tool-Agent",
          toolCallId: "call-agent-preliminary",
          state: "output-available",
          preliminary: true,
          input: {
            description: "Run subagent",
            prompt: "Inspect",
            subagent_type: "Explore",
          },
          output: "Partial result",
          providerExecuted: true,
        },
      ],
    } as any;

    const { container } = render(
      <MessageParts
        message={message}
        renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
      />,
    );

    expect(container.querySelector(".bg-primary")).toBeNull();
  });

  it("renders reasoning trigger labels as inline content inside the button", () => {
    const message = {
      id: "reasoning-message",
      role: "assistant",
      metadata: { sessionId: "sess-3", parentToolUseId: null },
      parts: [{ type: "reasoning", text: "Need to think", state: "done" }],
    } as any;

    const { container } = render(
      <MessageParts
        message={message}
        renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
      />,
    );

    expect(screen.getByText("Thought for a few seconds")).toBeTruthy();
    expect(container.querySelector("button p")).toBeNull();
  });
});
