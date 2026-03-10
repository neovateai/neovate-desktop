import type { ContractRouterClient } from "@orpc/contract";

import { agentContract } from "../../../../shared/features/agent/contract";
import { client } from "../../orpc";
import { ClaudeCodeChat } from "./chat";
import { ClaudeCodeChatTransport } from "./chat-transport";

type AgentRpc = ContractRouterClient<{ agent: typeof agentContract }>["agent"];

export class ClaudeCodeChatManager {
  private readonly chats = new Map<string, ClaudeCodeChat>();
  private readonly transport: ClaudeCodeChatTransport;

  constructor(private readonly rpc: AgentRpc) {
    this.transport = new ClaudeCodeChatTransport(rpc);
  }

  async createSession(cwd: string) {
    const { sessionId, currentModel, modelScope, ...capabilities } =
      await this.rpc.claudeCode.createSession({ cwd });
    const chat = new ClaudeCodeChat({
      id: sessionId,
      transport: this.transport,
    });
    chat.store.setState({ capabilities });
    this.chats.set(sessionId, chat);
    return { sessionId, currentModel, modelScope, ...capabilities };
  }

  async loadSession(sessionId: string, cwd: string) {
    const { capabilities, messages, currentModel, modelScope } =
      await this.rpc.claudeCode.loadSession({
        sessionId,
        cwd,
      });

    const chat = new ClaudeCodeChat({
      id: sessionId,
      transport: this.transport,
      messages,
    });
    chat.store.setState({ capabilities });
    this.chats.set(sessionId, chat);
    return { sessionId, currentModel, modelScope, ...capabilities };
  }

  getChat(sessionId: string) {
    return this.chats.get(sessionId);
  }

  async removeSession(sessionId: string): Promise<void> {
    const chat = this.chats.get(sessionId);
    if (!chat) return;

    await chat.stop();
    await chat.dispose();
    this.chats.delete(sessionId);
  }
}

export const claudeCodeChatManager = new ClaudeCodeChatManager(client.agent);
