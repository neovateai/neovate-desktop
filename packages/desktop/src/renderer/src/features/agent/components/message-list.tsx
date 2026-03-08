import type { ClaudeCodeUIMessage } from "../../../../../shared/features/agent/chat-types";
import type { ToolCallState } from "../store";
import { MarkdownContent } from "./markdown-content";
import { ToolActionsGroup } from "./tool-actions-group";

type Props = {
  messages: ClaudeCodeUIMessage[];
  streaming?: boolean;
};

export function MessageList({ messages, streaming }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((msg, idx) => {
        const text = msg.parts
          .filter((p): p is { type: "text"; text: string } => p.type === "text")
          .map((p) => p.text)
          .join("");
        const reasoning = msg.parts
          .filter((p): p is { type: "reasoning"; reasoning: string } => p.type === "reasoning")
          .map((p) => p.reasoning)
          .join("");
        const toolCalls: ToolCallState[] = msg.parts
          .filter(
            (p): p is Extract<typeof p, { type: "tool-invocation" }> => p.type === "tool-invocation",
          )
          .map((p) => ({
            toolCallId: p.toolCallId,
            name: p.toolName,
            status: p.state === "partial-call" ? "running" : "completed",
            input: "args" in p ? p.args : undefined,
          }));

        return (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 text-sm ${
                msg.role === "user"
                  ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                  : "bg-muted text-foreground"
              }`}
            >
              {reasoning && (
                <div className="mb-2 border-b border-border pb-2 text-xs italic text-muted-foreground">
                  {reasoning}
                </div>
              )}
              {msg.role === "assistant" ? (
                <MarkdownContent
                  content={text}
                  streaming={streaming && idx === messages.length - 1}
                />
              ) : (
                text
              )}
              {toolCalls.length > 0 && <ToolActionsGroup toolCalls={toolCalls} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
