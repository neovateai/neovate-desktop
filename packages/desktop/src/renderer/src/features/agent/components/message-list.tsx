import { useEffect } from "react";

import debug from "debug";

import type { AgentMessage } from "../../../../../shared/features/agent/types";

const log = debug("neovate:chat-message-list");

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../../components/ai-elements/reasoning";
import { Message, MessageContent } from "../../../components/ai-elements/message";

import { ClaudeCodeToolUIPart } from "./tool-parts";

/** @deprecated Legacy props — use `AgentMessageListProps` instead. */
type LegacyProps = {
  messages: { id: string; role: string; content: string; thinking?: string }[];
  toolCalls: Map<string, { toolCallId: string; name: string; status: string }>;
};

type AgentMessageListProps = {
  agentMessages: AgentMessage[];
};

type Props = AgentMessageListProps & Partial<LegacyProps>;

export function MessageList({ agentMessages }: Props) {
  useEffect(() => {
    if (agentMessages?.length) {
      log("agentMessages: %O", agentMessages);
    }
  }, [agentMessages]);

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
      {agentMessages.map((msg) => (
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
                      messages={agentMessages}
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
