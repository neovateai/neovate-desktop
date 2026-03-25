import type { ReactNode } from "react";

import { isReasoningUIPart, isToolUIPart, type ToolUIPart } from "ai";
import { CheckIcon, CopyIcon, ChevronDownIcon } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";

import type {
  ClaudeCodeUIMessage,
  ClaudeCodeUITools,
} from "../../../../../shared/claude-code/types";

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "../../../components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../../components/ai-elements/reasoning";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../../components/ui/collapsible";
import { cn } from "../../../lib/utils";
import { useMarkdownComponents } from "../hooks/use-markdown-components";
import { useAssistantMessageSummaryCollapse } from "./use-assistant-message-summary-collapse";

type RenderToolPart = (
  message: ClaudeCodeUIMessage,
  part: ToolUIPart<ClaudeCodeUITools>,
) => ReactNode;

export function MessageParts({
  message,
  renderToolPart,
  isComplete = true,
}: {
  message: ClaudeCodeUIMessage;
  renderToolPart: RenderToolPart;
  isComplete?: boolean;
}) {
  if (message.role !== "assistant") {
    return <MessagePartRenderer message={message} renderToolPart={renderToolPart} />;
  }

  return (
    <AssistantMessageParts
      message={message}
      renderToolPart={renderToolPart}
      isComplete={isComplete}
    />
  );
}

function AssistantMessageParts({
  message,
  renderToolPart,
  isComplete = true,
}: {
  message: ClaudeCodeUIMessage;
  renderToolPart: RenderToolPart;
  isComplete?: boolean;
}) {
  const {
    collapseMode,
    collapsibleMessage,
    isCollapsible,
    isOpen,
    messageCount,
    reasoningCount,
    setIsOpen,
    trailingMessage,
    toolCallCount,
  } = useAssistantMessageSummaryCollapse(message);
  const { t } = useTranslation();

  const triggerLabel = [
    reasoningCount > 0 ? t("chat.messages.summaryReasoningOnly", { reasoningCount }) : null,
    toolCallCount > 0 ? t("chat.messages.summaryToolsOnly", { toolCallCount }) : null,
    messageCount > 0 ? t("chat.messages.summaryMessagesOnly", { messageCount }) : null,
  ]
    .filter(Boolean)
    .join(t("chat.messages.summarySeparator"));

  if (!isCollapsible || trailingMessage == null) {
    return (
      <MessagePartRenderer
        message={message}
        renderToolPart={renderToolPart}
        isComplete={isComplete}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <Collapsible className="w-full" onOpenChange={setIsOpen} open={isOpen}>
        <CollapsibleTrigger
          className={cn(
            "flex w-full items-center gap-2 text-sm text-muted-foreground transition-[color,height,margin,opacity] duration-200 hover:text-foreground",
            collapseMode === "prepare" &&
              "h-0 min-h-0 overflow-hidden opacity-0 pointer-events-none",
          )}
        >
          <ChevronDownIcon
            className={cn(
              "size-4 shrink-0 transition-transform duration-150",
              isOpen ? "rotate-0" : "-rotate-90",
            )}
          />
          <span>{triggerLabel}</span>
        </CollapsibleTrigger>
        <CollapsibleContent className={cn(collapseMode === "prepare" ? "mt-0" : "mt-2")}>
          <MessagePartRenderer
            message={collapsibleMessage}
            renderToolPart={renderToolPart}
            showActions={false}
          />
        </CollapsibleContent>
      </Collapsible>
      {trailingMessage ? (
        <MessagePartRenderer
          message={trailingMessage}
          renderToolPart={renderToolPart}
          isComplete={isComplete}
        />
      ) : null}
    </div>
  );
}

function CopyMarkdownButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    timeoutRef.current = setTimeout(() => {
      setCopied(false);
      timeoutRef.current = null;
    }, 2000);
  }, [text]);

  return (
    <MessageAction tooltip={t("chat.messages.copyMarkdown")} onClick={handleCopy} size="icon-xs">
      {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
    </MessageAction>
  );
}

export const MessagePartRenderer = memo(
  ({
    message,
    renderToolPart,
    showActions = true,
    isComplete = true,
  }: {
    message: ClaudeCodeUIMessage;
    renderToolPart: RenderToolPart;
    showActions?: boolean;
    isComplete?: boolean;
  }) => {
    const markdownComponents = useMarkdownComponents();
    const lastTextIndex = message.parts.findLastIndex((p) => p.type === "text");
    return (
      <div className="flex flex-col gap-2 w-full">
        {message.parts.map((part, index) => {
          if (isToolUIPart(part)) {
            if (part.type === "dynamic-tool") {
              return null;
            }
            return (
              <ErrorBoundary key={part.toolCallId} fallback={<ToolPartErrorFallback />}>
                <div data-key={part.toolCallId}>{renderToolPart(message, part)}</div>
              </ErrorBoundary>
            );
          }

          switch (part.type) {
            case "text": {
              const canShowActions =
                message.role === "assistant" &&
                showActions &&
                isComplete &&
                index === lastTextIndex &&
                !!part.text.trim();
              return (
                <Message
                  key={`${message.id}-${index}`}
                  data-key={`${message.id}-${index}`}
                  from={message.role}
                >
                  <MessageContent>
                    {message.role === "assistant" ? (
                      <MessageResponse components={markdownComponents}>{part.text}</MessageResponse>
                    ) : (
                      <p className="m-0 whitespace-pre-wrap">{part.text}</p>
                    )}
                  </MessageContent>
                  {canShowActions && (
                    <MessageActions className="mt-2">
                      <CopyMarkdownButton text={part.text} />
                    </MessageActions>
                  )}
                </Message>
              );
            }
            case "reasoning":
              if (!isReasoningUIPart(part)) {
                return null;
              }
              return (
                <Reasoning
                  key={`${message.id}-${index}`}
                  data-key={`${message.id}-${index}`}
                  className="w-full mb-0"
                  isStreaming={part.state === "streaming"}
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
  },
);

MessagePartRenderer.displayName = "MessagePartRenderer";

function ToolPartErrorFallback() {
  return (
    <div className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      Failed to render tool output
    </div>
  );
}
