import type { ContractRouterClient } from "@orpc/contract";
import type { ChatRequestOptions, ChatTransport } from "ai";

import debug from "debug";

const log = debug("neovate:agent-chat:transport");

import type {
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
  ClaudeCodeUIMessage,
} from "../../../../shared/claude-code/types";

import { agentContract } from "../../../../shared/features/agent/contract";

type AgentRpc = ContractRouterClient<{ agent: typeof agentContract }>["agent"];

export class ClaudeCodeChatTransport implements ChatTransport<ClaudeCodeUIMessage> {
  constructor(private readonly rpc: AgentRpc) {}

  /**
   * Stub — required by ChatTransport interface for AbstractChat constructor,
   * but never called because ClaudeCodeChat reassigns sendMessage to bypass makeRequest.
   */
  async sendMessages(
    _options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: ClaudeCodeUIMessage[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ): Promise<ReadableStream> {
    throw new Error("sendMessages is not used — use send() instead");
  }

  async reconnectToStream(_options: { chatId: string } & ChatRequestOptions) {
    return null;
  }

  /** Fire-and-forget: push a user message to the server. */
  async send(sessionId: string, message: ClaudeCodeUIMessage) {
    log("send: sessionId=%s", sessionId);
    await this.rpc.claudeCode.send({ sessionId, message });
  }

  subscribe({ chatId }: { chatId: string }) {
    return this.rpc.claudeCode.subscribe({ sessionId: chatId });
  }

  dispatch({
    chatId,
    dispatch,
  }: {
    chatId: string;
    dispatch: ClaudeCodeUIDispatch;
  }): Promise<ClaudeCodeUIDispatchResult> {
    log("dispatch: chatId=%s kind=%s", chatId, dispatch.kind);
    return this.rpc.claudeCode.dispatch({ sessionId: chatId, dispatch });
  }
}
