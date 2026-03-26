import { isDataUIPart, isReasoningUIPart, isToolUIPart } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";

import type { ClaudeCodeUIMessage } from "../../../../../shared/claude-code/types";

const AUTO_CLOSE_DELAY = 1000;

export type CollapseMode = "normal" | "prepare" | "collapsed";
type CollapseKind = "live" | "restored" | null;
type DeliveryMode = "stream" | "restored" | undefined;

function isSummaryMessagePart(part: ClaudeCodeUIMessage["parts"][number]) {
  if (isToolUIPart(part) || isReasoningUIPart(part) || isDataUIPart(part)) {
    return false;
  }

  return part.type === "text" || part.type === "file";
}

function getSuccessResultText(part: ClaudeCodeUIMessage["parts"][number] | undefined) {
  if (part == null || !isDataUIPart(part) || part.type !== "data-result/success") {
    return null;
  }

  const data = part.data;
  if (data == null || typeof data !== "object" || !("result" in data)) {
    return null;
  }

  return typeof data.result === "string" ? data.result : null;
}

function getCollapseKind(args: {
  deliveryMode: DeliveryMode;
  hasInit: boolean;
  hasSuccess: boolean;
  hasSummaryContent: boolean;
  liveTrailingPartIndex: number;
  restoredTrailingPartIndex: number;
}): CollapseKind {
  const {
    deliveryMode,
    hasInit,
    hasSuccess,
    hasSummaryContent,
    liveTrailingPartIndex,
    restoredTrailingPartIndex,
  } = args;

  if (!hasSummaryContent) {
    return null;
  }

  if (deliveryMode === "restored" && restoredTrailingPartIndex !== -1) {
    return "restored";
  }

  if (hasInit && hasSuccess && liveTrailingPartIndex !== -1) {
    return "live";
  }

  return null;
}

function getTrailingPartIndex(args: {
  collapseKind: CollapseKind;
  liveTrailingPartIndex: number;
  restoredTrailingPartIndex: number;
}) {
  const { collapseKind, liveTrailingPartIndex, restoredTrailingPartIndex } = args;

  if (collapseKind === "live") {
    return liveTrailingPartIndex;
  }

  if (collapseKind === "restored") {
    return restoredTrailingPartIndex;
  }

  return -1;
}

export function useAssistantMessageSummaryCollapse(message: ClaudeCodeUIMessage) {
  const {
    collapsibleMessage,
    trailingMessage,
    collapseKind,
    messageCount,
    reasoningCount,
    toolCallCount,
  } = useMemo(() => {
    const firstPart = message.parts[0];
    const lastPart = message.parts.at(-1);
    const deliveryMode = message.metadata?.deliveryMode;
    const hasInit =
      firstPart != null && isDataUIPart(firstPart) && firstPart.type === "data-system/init";
    const hasSuccess =
      lastPart != null && isDataUIPart(lastPart) && lastPart.type === "data-result/success";
    const successResultText = getSuccessResultText(lastPart);

    let lastNonDataPartIndex = -1;
    let lastNonDataTextIndex = -1;
    let lastSummaryPartIndex = -1;
    let toolCallCount = 0;
    let messageCount = 0;
    let reasoningCount = 0;

    for (const part of message.parts) {
      if (isToolUIPart(part)) {
        if (part.type !== "dynamic-tool") {
          toolCallCount += 1;
        }
        continue;
      }

      if (isReasoningUIPart(part)) {
        reasoningCount += 1;
      }

      if (isSummaryMessagePart(part)) {
        messageCount += 1;
      }
    }

    for (let index = message.parts.length - 1; index >= 0; index -= 1) {
      const part = message.parts[index];
      if (isDataUIPart(part)) {
        continue;
      }

      lastNonDataPartIndex = index;
      if (part.type === "text") {
        lastNonDataTextIndex = index;
      }
      if (isSummaryMessagePart(part)) {
        lastSummaryPartIndex = index;
      }

      break;
    }

    const lastNonDataTextPart =
      lastNonDataTextIndex !== -1 ? message.parts[lastNonDataTextIndex] : null;
    const liveTrailingPartIndex =
      lastNonDataTextIndex !== -1 &&
      lastNonDataTextIndex === lastNonDataPartIndex &&
      lastNonDataTextPart?.type === "text" &&
      lastNonDataTextPart.text === successResultText
        ? lastNonDataTextIndex
        : -1;
    const hasRestoredProcessContent = toolCallCount > 0 || reasoningCount > 0;
    const restoredTrailingPartIndex =
      lastSummaryPartIndex !== -1 &&
      lastSummaryPartIndex === lastNonDataPartIndex &&
      hasRestoredProcessContent
        ? lastSummaryPartIndex
        : -1;
    const hasSummaryContent = toolCallCount > 0 || messageCount > 0 || reasoningCount > 0;
    const collapseKind = getCollapseKind({
      deliveryMode,
      hasInit,
      hasSuccess,
      hasSummaryContent,
      liveTrailingPartIndex,
      restoredTrailingPartIndex,
    });
    const trailingPartIndex = getTrailingPartIndex({
      collapseKind,
      liveTrailingPartIndex,
      restoredTrailingPartIndex,
    });
    const collapsibleParts =
      trailingPartIndex === -1 ? message.parts : message.parts.slice(0, trailingPartIndex);
    const trailingParts = trailingPartIndex === -1 ? [] : message.parts.slice(trailingPartIndex);

    if (trailingPartIndex !== -1) {
      messageCount -= 1;
    }

    return {
      collapseKind,
      collapsibleMessage: { ...message, parts: collapsibleParts },
      messageCount,
      reasoningCount,
      trailingMessage: trailingParts.length > 0 ? { ...message, parts: trailingParts } : null,
      toolCallCount,
    };
  }, [message]);

  const [collapseMode, setCollapseMode] = useState<CollapseMode>(
    collapseKind === "restored" ? "collapsed" : "normal",
  );
  const [isOpen, setIsOpen] = useState(false);
  const collapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (collapseKind == null) {
      if (collapseTimerRef.current != null) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      setCollapseMode("normal");
      setIsOpen(false);
      return undefined;
    }

    if (collapseKind === "restored") {
      setCollapseMode("collapsed");
      setIsOpen(false);
      return undefined;
    }

    if (collapseMode === "normal") {
      setCollapseMode("prepare");
      setIsOpen(true);
    }
  }, [collapseKind, collapseMode]);

  useEffect(() => {
    if (collapseKind !== "live" || collapseMode !== "prepare") {
      return undefined;
    }

    collapseTimerRef.current = setTimeout(() => {
      collapseTimerRef.current = null;
      setCollapseMode("collapsed");
      setIsOpen(false);
    }, AUTO_CLOSE_DELAY);

    return () => {
      if (collapseTimerRef.current != null) {
        clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, [collapseKind, collapseMode]);

  return {
    collapseMode,
    collapsibleMessage,
    isCollapsible: collapseMode !== "normal" && trailingMessage != null,
    isOpen,
    messageCount,
    reasoningCount,
    setIsOpen,
    trailingMessage,
    toolCallCount,
  };
}
