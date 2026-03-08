import type { ClaudeCodeUIMessage } from "../../../../../shared/claude-code/types";
import { isToolUIPart } from "ai";
import { ClaudeCodeToolUIPart } from "./tool-parts";
import { Message, MessageContent, MessageResponse } from "../../../components/ai-elements/message";

export function MessageParts({ message }: { message: ClaudeCodeUIMessage }) {
  return (
    <>
      {message.parts.map((part, index) => {
        if (isToolUIPart(part)) {
          if (part.type === "dynamic-tool") {
            return null;
          }
          return <ClaudeCodeToolUIPart key={part.toolCallId} message={message} part={part} />;
        }

        switch (part.type) {
          case "text":
            return (
              <Message key={`${message.id}-${index}`} from={message.role}>
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
                className="border-b border-border pb-2 text-xs italic text-muted-foreground"
              >
                {part.text}
              </div>
            );
          default:
            return null;
        }
      })}
    </>
  );
}
