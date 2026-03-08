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

  async createSession(cwd: string): Promise<{ sessionId: string; commands?: { name: string }[] }> {
    const result = await this.rpc.claudeCode.createSession({ cwd });
    this.chats.set(
      result.sessionId,
      new ClaudeCodeChat({
        id: result.sessionId,
        transport: this.transport,
      }),
    );
    return result;
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
