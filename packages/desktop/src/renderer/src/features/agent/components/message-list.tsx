import type { ChatMessage } from "../store";
import { MarkdownContent } from "./markdown-content";
import { ToolActionsGroup } from "./tool-actions-group";

type Props = {
  messages: ChatMessage[];
  streaming?: boolean;
};

export function MessageList({ messages, streaming }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((msg, idx) => (
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
            {msg.thinking && (
              <div className="mb-2 border-b border-border pb-2 text-xs italic text-muted-foreground">
                {msg.thinking}
              </div>
            )}
            {msg.role === "assistant" ? (
              <MarkdownContent
                content={msg.content}
                streaming={streaming && idx === messages.length - 1}
              />
            ) : (
              msg.content
            )}
            {msg.toolCalls && msg.toolCalls.length > 0 && (
              <ToolActionsGroup toolCalls={msg.toolCalls} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
