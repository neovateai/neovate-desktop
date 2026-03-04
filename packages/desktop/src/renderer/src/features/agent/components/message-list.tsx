import type { ChatMessage, ToolCallState } from "../store";

type Props = {
  messages: ChatMessage[];
  toolCalls: Map<string, ToolCallState>;
};

export function MessageList({ messages, toolCalls }: Props) {
  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[80%] rounded-lg px-4 py-2 text-sm whitespace-pre-wrap ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground"
            }`}
          >
            {msg.thinking && (
              <div className="mb-2 border-b border-border pb-2 text-xs italic text-muted-foreground">
                {msg.thinking}
              </div>
            )}
            {msg.content}
          </div>
        </div>
      ))}

      {toolCalls.size > 0 && (
        <div className="flex flex-col gap-1">
          {Array.from(toolCalls.values()).map((tc) => (
            <div
              key={tc.toolCallId}
              className="flex items-center gap-2 rounded border border-border px-3 py-1.5 text-xs text-muted-foreground"
            >
              <span
                className={`size-2 rounded-full ${
                  tc.status === "completed"
                    ? "bg-green-500"
                    : tc.status === "error"
                      ? "bg-red-500"
                      : "bg-yellow-500"
                }`}
              />
              <span className="font-medium">{tc.name}</span>
              <span className="text-muted-foreground/60">{tc.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
