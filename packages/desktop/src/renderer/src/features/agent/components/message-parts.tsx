import type { ReactNode } from "react";

import { isToolUIPart, type ToolUIPart } from "ai";

import type {
  ClaudeCodeUIMessage,
  ClaudeCodeUITools,
} from "../../../../../shared/claude-code/types";

import { Message, MessageContent, MessageResponse } from "../../../components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../../components/ai-elements/reasoning";

type RenderToolPart = (
  message: ClaudeCodeUIMessage,
  part: ToolUIPart<ClaudeCodeUITools>,
) => ReactNode;

export function MessageParts({
  message,
  renderToolPart,
}: {
  message: ClaudeCodeUIMessage;
  renderToolPart: RenderToolPart;
}) {
  return <MessagePartRenderer message={message} renderToolPart={renderToolPart} />;
}

export function MessagePartRenderer({
  message,
  renderToolPart,
}: {
  message: ClaudeCodeUIMessage;
  renderToolPart: RenderToolPart;
}) {
  return (
    <div className="flex flex-col gap-1 w-full">
      {message.parts.map((part, index) => {
        if (isToolUIPart(part)) {
          if (part.type === "dynamic-tool") {
            return null;
          }
          return (
            <div key={part.toolCallId} data-key={part.toolCallId}>
              {renderToolPart(message, part)}
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
                    <p className="m-0 whitespace-pre-wrap">{part.text}</p>
                  )}
                </MessageContent>
              </Message>
            );
          case "reasoning":
            return (
              <Reasoning
                key={`${message.id}-${index}`}
                data-key={`${message.id}-${index}`}
                className="w-full mb-0"
              >
                <ReasoningTrigger className="italic" />
                <ReasoningContent className="pl-6">{part.text}</ReasoningContent>
              </Reasoning>
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
    </div>
  );
}
