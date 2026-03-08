import type { ClaudeCodeUIMessage } from "../../../../../shared/features/agent/chat-types";
import { MarkdownContent } from "./markdown-content";

type Props = {
  messages: ClaudeCodeUIMessage[];
  streaming?: boolean;
};

function MessagePart({
  part,
  streaming,
}: {
  part: ClaudeCodeUIMessage["parts"][number];
  streaming?: boolean;
}) {
  switch (part.type) {
    case "text":
      return streaming ? (
        <MarkdownContent content={part.text} streaming />
      ) : (
        <MarkdownContent content={part.text} />
      );
    case "reasoning":
      return (
        <div className="border-b border-border pb-2 text-xs italic text-muted-foreground">
          {part.text}
        </div>
      );
    default:
      return null;
  }
}

export function MessageList({ messages, streaming }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((msg, idx) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`flex max-w-[80%] flex-col gap-1 rounded-lg px-4 py-2 text-sm ${
              msg.role === "user"
                ? "whitespace-pre-wrap bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {msg.parts.map((part, i) => (
              <MessagePart
                key={i}
                part={part}
                streaming={streaming && idx === messages.length - 1}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
