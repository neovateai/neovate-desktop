import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeCodeUIMessage } from "../../../../shared/claude-code/types";

import {
  materializeSDKMessagesToUIMessage,
  SDKMessageTransformer,
} from "../sdk-message-transformer";

export async function sdkMessagesToUIMessage(
  messages: Iterable<SDKMessage> | AsyncIterable<SDKMessage>,
  options?: {
    transformer?: SDKMessageTransformer;
  },
): Promise<ClaudeCodeUIMessage | undefined> {
  return materializeSDKMessagesToUIMessage(messages, options);
}
