import type { ClaudeCodeTools } from "../../../../shared/claude-code";

import { isToolUIPart, type UIDataTypes, type UIMessage } from "ai";

import { Message, MessageContent, MessageResponse } from "../ai-elements/message";
import { ClaudeCodeToolUIPart } from "./index";

export type ClaudeCodeUIMessage = UIMessage<unknown, UIDataTypes, ClaudeCodeTools>;

export function ClaudeCodeMessageParts({ message }: { message: ClaudeCodeUIMessage }) {
  return (
    <div className="text-sm">
      {message.parts.map((part, index) => {
        if (isToolUIPart(part)) {
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
          default:
            return null;
        }
      })}
    </div>
  );
}
