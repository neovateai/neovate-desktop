import { useEffect } from "react";

import debug from "debug";

import type { UIMessage } from "../../../../../shared/features/agent/types";

const log = debug("neovate:chat-message-list");

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../../components/ai-elements/reasoning";
import { Message, MessageContent, MessageResponse } from "../../../components/ai-elements/message";
import {
  Attachment,
  AttachmentPreview,
  AttachmentInfo,
} from "../../../components/ai-elements/attachments";
import {
  Sources,
  SourcesTrigger,
  SourcesContent,
  Source,
} from "../../../components/ai-elements/sources";

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
                case "file":
                  return (
                    <Attachment
                      key={`${msg.id}-file-${i}`}
                      data={{ ...part, id: part.url || `${msg.id}-file-${i}` }}
                    >
                      <AttachmentPreview />
                      <AttachmentInfo showMediaType />
                    </Attachment>
                  );
                case "source-url":
                  return (
                    <Sources key={`${msg.id}-source-${i}`}>
                      <SourcesTrigger count={1} />
                      <SourcesContent>
                        <Source href={part.url} title={part.title || part.url} />
                      </SourcesContent>
                    </Sources>
                  );
                case "source-document":
                  return (
                    <Sources key={`${msg.id}-source-${i}`}>
                      <SourcesTrigger count={1} />
                      <SourcesContent>
                        <Source href="#" title={part.title || part.filename || "Document"} />
                      </SourcesContent>
                    </Sources>
                  );
                case "step-start":
                  return null;
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
