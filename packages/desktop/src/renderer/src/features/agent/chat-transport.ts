import { eventIteratorToUnproxiedDataStream } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import type { ChatRequestOptions, ChatTransport } from "ai";
import { agentContract } from "../../../../shared/features/agent/contract";
import type {
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
  ClaudeCodeUIMessage,
} from "../../../../shared/claude-code/types";

type AgentRpc = ContractRouterClient<{ agent: typeof agentContract }>["agent"];

export class ClaudeCodeChatTransport implements ChatTransport<ClaudeCodeUIMessage> {
  constructor(private readonly rpc: AgentRpc) {}

  async sendMessages(
    options: {
      trigger: "submit-message" | "regenerate-message";
      chatId: string;
      messageId: string | undefined;
      messages: ClaudeCodeUIMessage[];
      abortSignal: AbortSignal | undefined;
    } & ChatRequestOptions,
  ) {
    const lastMessage = options.messages.at(-1);
    if (!lastMessage) {
      throw new Error("Cannot send chat request without a message");
    }

    return eventIteratorToUnproxiedDataStream(
      await this.rpc.claudeCode.stream(
        { sessionId: options.chatId, message: lastMessage },
        { signal: options.abortSignal },
      ),
    );
  }

  async reconnectToStream(_options: { chatId: string } & ChatRequestOptions) {
    return null;
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
    return this.rpc.claudeCode.dispatch({ sessionId: chatId, dispatch });
  }
}
