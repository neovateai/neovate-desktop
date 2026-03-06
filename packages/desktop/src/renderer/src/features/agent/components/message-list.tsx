import { useEffect } from "react";

import debug from "debug";

import type { UIMessage, DynamicToolPart } from "../../../../../shared/features/agent/types";
import { getParentToolUseId } from "../../../../../shared/features/agent/types";

const log = debug("neovate:chat-message-list");

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../../components/ai-elements/reasoning";
import { Message, MessageContent, MessageResponse } from "../../../components/ai-elements/message";

import { ClaudeCodeToolUIPart } from "./tool-parts";

type Props = {
  messages: UIMessage[];
  sessionId?: string;
};

export function MessageList({ messages, sessionId }: Props) {
  useEffect(() => {
    if (messages?.length) {
      log("messages: %O", messages);
    }
  }, [messages]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {messages.map((msg) => (
        <Message key={msg.id} from={msg.role}>
          <MessageContent>
            {msg.parts.map((part, i) => {
              switch (part.type) {
                case "text":
                  return <MessageResponse key={`${msg.id}-text-${i}`}>{part.text}</MessageResponse>;
                case "reasoning":
                  return (
                    <Reasoning key={`${msg.id}-reasoning-${i}`} isStreaming={false}>
                      <ReasoningTrigger />
                      <ReasoningContent>{part.text}</ReasoningContent>
                    </Reasoning>
                  );
                case "dynamic-tool":
                  // Skip child tool parts (they are rendered inside TaskToolCard)
                  if (getParentToolUseId(part as DynamicToolPart)) return null;
                  return (
                    <ClaudeCodeToolUIPart
                      key={part.toolCallId}
                      part={part as DynamicToolPart}
                      messages={messages}
                      sessionId={sessionId}
                    />
                  );
                default:
                  return null;
              }
            })}
          </MessageContent>
        </Message>
      ))}
    </div>
  );
}
