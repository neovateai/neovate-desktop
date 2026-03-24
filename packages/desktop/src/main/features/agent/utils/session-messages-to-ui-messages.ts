import type { SDKMessage, SessionMessage } from "@anthropic-ai/claude-agent-sdk";

import debug from "debug";

import type { ClaudeCodeUIMessage } from "../../../../shared/claude-code/types";

import appLog from "../../../core/logger";
import { sdkMessagesToUIMessage } from "./sdk-messages-to-ui-message";

const log = debug("neovate:session-messages");

function countMessageTypes(messages: SDKMessage[]) {
  const counts = new Map<string, number>();

  for (const message of messages) {
    const key =
      message.type === "system"
        ? `${message.type}:${message.subtype}`
        : message.type === "result"
          ? `${message.type}:${message.subtype}`
          : message.type;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return Object.fromEntries(counts);
}

/**
 * Convert raw SDK session messages into UI messages.
 * Human prompts become user messages; assistant/tool_result batches
 * are replayed through the AI SDK stream protocol.
 *
 * Accepts SessionMessage[] (from getSessionMessages) — cast internally
 * to SDKMessage[] since the runtime data includes system/result types
 * that the SessionMessage type declaration doesn't cover.
 */
export async function sessionMessagesToUIMessages(
  sessionMessages: SessionMessage[],
): Promise<ClaudeCodeUIMessage[]> {
  log("START count=%d", sessionMessages.length);
  const results: ClaudeCodeUIMessage[] = [];
  let batch: SDKMessage[] = [];
  const messages = sessionMessages as unknown as SDKMessage[];

  const rawMessageTypes = countMessageTypes(messages);
  log("RAW messageTypes=%O", rawMessageTypes);
  appLog.info("[restore-debug] sessionMessagesToUIMessages raw messageTypes=%j", rawMessageTypes);

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const batchCopy = batch;
    batch = [];
    const batchTypes = batchCopy.map((message) =>
      message.type === "system" || message.type === "result"
        ? `${message.type}:${message.subtype}`
        : message.type,
    );
    log("FLUSH batchSize=%d batchTypes=%O", batchCopy.length, batchTypes);
    appLog.info(
      "[restore-debug] sessionMessagesToUIMessages flush batchSize=%d batchTypes=%j",
      batchCopy.length,
      batchTypes,
    );
    const last = await sdkMessagesToUIMessage(batchCopy);
    if (last) {
      last.metadata = {
        deliveryMode: "restored",
        parentToolUseId: last.metadata?.parentToolUseId ?? null,
        sessionId: last.metadata?.sessionId ?? batchCopy[0]?.session_id ?? "",
      };
      log(
        "FLUSH result messageId=%s role=%s partTypes=%O",
        last.id,
        last.role,
        last.parts.map((part) => part.type),
      );
      appLog.info(
        "[restore-debug] sessionMessagesToUIMessages result messageId=%s role=%s partTypes=%j",
        last.id,
        last.role,
        last.parts.map((part) => part.type),
      );
      results.push(last);
    } else {
      log("FLUSH result=<empty>");
      appLog.info("[restore-debug] sessionMessagesToUIMessages result=<empty>");
    }
  };

  for (const msg of messages) {
    // Skip messages that don't contribute to UIMessage content
    if (msg.type === "system" && msg.subtype !== "init") continue;
    if (msg.type === "result") continue;

    if (msg.type !== "user" && msg.type !== "assistant" && msg.type !== "system") {
      continue;
    }

    if (msg.type !== "user") {
      batch.push(msg);
      continue;
    }

    const content = msg.message.content;
    const isToolResultMessage =
      Array.isArray(content) && content.some((p: { type: string }) => p.type === "tool_result");
    const isHumanTextPrompt = typeof content === "string";
    const isHumanArrayPrompt =
      Array.isArray(content) &&
      content.some((b: { type: string }) => b.type === "text" || b.type === "image");
    const isHumanPrompt = !isToolResultMessage && (isHumanTextPrompt || isHumanArrayPrompt);

    if (isHumanPrompt) {
      await flushBatch();
      const parts: ClaudeCodeUIMessage["parts"] = [];

      if (typeof content === "string") {
        parts.push({
          type: "text",
          text: content,
          state: "done",
        } as ClaudeCodeUIMessage["parts"][number]);
      } else if (Array.isArray(content)) {
        const textStr = content
          .filter((b: { type: string }) => b.type === "text")
          .map((b: { type: string; text?: string }) => b.text ?? "")
          .join("");
        if (textStr) {
          parts.push({
            type: "text",
            text: textStr,
            state: "done",
          } as ClaudeCodeUIMessage["parts"][number]);
        }
        for (const b of content) {
          const block = b as {
            type: string;
            source?: { type: string; media_type?: string; data?: string };
          };
          if (block.type === "image" && block.source?.type === "base64") {
            const mediaType = block.source.media_type ?? "image/png";
            parts.push({
              type: "file",
              mediaType,
              url: `data:${mediaType};base64,${block.source.data}`,
            } as ClaudeCodeUIMessage["parts"][number]);
          }
        }
      }

      if (parts.length === 0) {
        parts.push({
          type: "text",
          text: typeof content === "string" ? content : "",
          state: "done",
        } as ClaudeCodeUIMessage["parts"][number]);
      }

      results.push({
        id: msg.uuid ?? crypto.randomUUID(),
        role: "user",
        parts,
        metadata: {
          deliveryMode: "restored",
          sessionId: msg.session_id,
          parentToolUseId: null,
        },
      } as ClaudeCodeUIMessage);
    } else {
      batch.push(msg);
    }
  }

  await flushBatch();
  log("DONE results=%d", results.length);
  return results;
}
