import { isToolUIPart } from "ai";

import type { ClaudeCodeUIMessage } from "../../../../../shared/claude-code/types";

import { Message, MessageContent, MessageResponse } from "../../../components/ai-elements/message";
import { ClaudeCodeToolUIPart } from "./tool-parts";

export function MessageParts({ message }: { message: ClaudeCodeUIMessage }) {
  return (
    <>
      {message.parts.map((part, index) => {
        if (isToolUIPart(part)) {
          if (part.type === "dynamic-tool") {
            return null;
          }
          return (
            <div key={part.toolCallId} data-key={part.toolCallId}>
              <ClaudeCodeToolUIPart message={message} part={part} />
            </div>
          );
        }

        switch (part.type) {
          case "text":
            return (
              <Message
                key={`${message.id}-${index}`}
                data-key={`${message.id}-${index}`}
                from={message.role}
              >
                <MessageContent>
                  {message.role === "assistant" ? (
                    <MessageResponse>{part.text}</MessageResponse>
                  ) : (
                    <p>{part.text}</p>
                  )}
                </MessageContent>
              </Message>
            );
          case "reasoning":
            return (
              <div
                key={`${message.id}-${index}`}
                data-key={`${message.id}-${index}`}
                className="border-b border-border pb-2 text-xs italic text-muted-foreground"
              >
                {part.text}
              </div>
            );
          case "file":
            if (part.mediaType.startsWith("image/")) {
              return (
                <img
                  key={`${message.id}-${index}`}
                  src={part.url}
                  alt={part.filename ?? ""}
                  className="max-h-48 rounded-md object-cover"
                />
              );
            }
            return null;
          default:
            return null;
        }
      })}
    </>
  );
}
