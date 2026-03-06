import { useEffect } from "react";

import debug from "debug";

import type { UIMessage } from "../../../../../shared/features/agent/types";

const log = debug("neovate:chat-message-list");

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../../components/ai-elements/reasoning";
import { Message, MessageContent } from "../../../components/ai-elements/message";

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
                  return (
                    <div key={`${msg.id}-text-${i}`} className="whitespace-pre-wrap text-sm">
                      {part.text}
                    </div>
                  );
                case "thinking":
                  return (
                    <Reasoning key={`${msg.id}-thinking-${i}`} isStreaming={false}>
                      <ReasoningTrigger />
                      <ReasoningContent>{part.thinking}</ReasoningContent>
                    </Reasoning>
                  );
                case "tool-invocation":
                  // Skip child tool parts (they are rendered inside TaskToolCard)
                  if (part.parentToolUseId) return null;
                  return (
                    <ClaudeCodeToolUIPart
                      key={part.toolCallId}
                      part={part}
                      messages={messages}
                      sessionId={sessionId}
                    />
                  );
                case "status":
                  return (
                    <div
                      key={`${msg.id}-status-${i}`}
                      className="text-xs italic text-muted-foreground"
                    >
                      {part.message}
                    </div>
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
