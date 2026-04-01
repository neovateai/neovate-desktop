import type { ContractRouterClient } from "@orpc/contract";

import debug from "debug";

import { agentContract } from "../../../../shared/features/agent/contract";
import { client } from "../../orpc";
import { useConfigStore } from "../config/store";
import { ClaudeCodeChat } from "./chat";
import { ClaudeCodeChatTransport } from "./chat-transport";
import { scrollPositions } from "./scroll-positions";
import { findPreWarmedSession, registerSessionInStore } from "./session-utils";
import { useAgentStore } from "./store";

const log = debug("neovate:chat-manager");

type AgentRpc = ContractRouterClient<{ agent: typeof agentContract }>["agent"];

export class ClaudeCodeChatManager {
  private readonly chats = new Map<string, ClaudeCodeChat>();
  private readonly transport: ClaudeCodeChatTransport;

  constructor(private readonly rpc: AgentRpc) {
    this.transport = new ClaudeCodeChatTransport(rpc);
  }

  #turnCallbacks = {
    onTurnComplete: (id: string, result: "success" | "error") => {
      const chat = this.chats.get(id);
      const pending = chat?.store.getState().pendingContextClear;

      if (pending) {
        chat!.store.setState({ pendingContextClear: undefined });
        log("onTurnComplete: pendingContextClear detected for session=%s", id.slice(0, 8));
        void this.#handleContextClear(id, pending);
      }

      const { activeSessionId, markTurnCompleted } = useAgentStore.getState();
      if (activeSessionId !== id) {
        markTurnCompleted(id, result);
        log("onTurnComplete: clearing scroll position for non-active session=%s", id.slice(0, 8));
        scrollPositions.delete(id);
      }
    },
    onTurnStart: (id: string) => {
      useAgentStore.getState().clearTurnResult(id);
    },
  };

  async createSession(cwd: string, opts?: { providerId?: string | null }) {
    const { sessionId, currentModel, modelScope, providerId, ...capabilities } =
      await this.rpc.claudeCode.createSession({ cwd, providerId: opts?.providerId });
    const chat = new ClaudeCodeChat({
      id: sessionId,
      transport: this.transport,
      ...this.#turnCallbacks,
    });
    chat.store.setState({ capabilities });
    this.chats.set(sessionId, chat);
    return { sessionId, currentModel, modelScope, providerId, ...capabilities };
  }

  async loadSession(sessionId: string, cwd: string) {
    const { capabilities, messages, currentModel, modelScope, providerId } =
      await this.rpc.claudeCode.loadSession({
        sessionId,
        cwd,
      });

    const chat = new ClaudeCodeChat({
      id: sessionId,
      transport: this.transport,
      messages,
      ...this.#turnCallbacks,
    });
    chat.store.setState({ capabilities });
    this.chats.set(sessionId, chat);
    return { sessionId, currentModel, modelScope, providerId, ...capabilities };
  }

  getChat(sessionId: string) {
    return this.chats.get(sessionId);
  }

  async rewindToMessage(
    sessionId: string,
    messageId: string,
    restoreFiles: boolean,
    title?: string,
  ): Promise<{ forkedSessionId: string; originalSessionId: string }> {
    const cwd = useAgentStore.getState().sessions.get(sessionId)?.cwd ?? "";
    log(
      "rewindToMessage: sessionId=%s messageId=%s restoreFiles=%s cwd=%s",
      sessionId.slice(0, 8),
      messageId.slice(0, 8),
      restoreFiles,
      cwd,
    );

    // 1. Call backend to rewind files (if requested), fork session, close original
    const result = await this.rpc.rewindToMessage({
      sessionId,
      messageId,
      restoreFiles,
      title,
    });

    // 2. Load the forked session via the normal loadSession flow
    const loaded = await this.loadSession(result.forkedSessionId, cwd);

    // 3. For file restores, dispose original chat immediately.
    //    For conversation-only, keep original alive during undo window.
    if (restoreFiles) {
      await this.disposeChat(sessionId);
    }

    log(
      "rewindToMessage: forked=%s model=%s",
      result.forkedSessionId.slice(0, 8),
      loaded.currentModel,
    );

    return {
      forkedSessionId: result.forkedSessionId,
      originalSessionId: sessionId,
    };
  }

  /** Dispose a chat without closing the backend session (already closed). */
  async disposeChat(sessionId: string): Promise<void> {
    const chat = this.chats.get(sessionId);
    if (!chat) return;
    chat.store.setState({ pendingContextClear: undefined });
    await chat.stop();
    await chat.dispose();
    this.chats.delete(sessionId);
    scrollPositions.delete(sessionId);
  }

  async removeSession(sessionId: string): Promise<void> {
    log("removeSession: clearing scroll position for session=%s", sessionId.slice(0, 8));
    scrollPositions.delete(sessionId);
    const chat = this.chats.get(sessionId);
    if (!chat) return;

    // Clear any pending context clear flag to prevent orphaned actions
    chat.store.setState({ pendingContextClear: undefined });
    await chat.stop();
    await chat.dispose();
    this.chats.delete(sessionId);
    this.rpc.claudeCode.closeSession({ sessionId }).catch(() => {});
  }

  async invalidateNewSessions(cwd?: string): Promise<void> {
    const store = useAgentStore.getState();
    let removedActive = false;

    for (const [id, session] of store.sessions) {
      if (session.isNew) {
        if (id === store.activeSessionId) removedActive = true;
        await this.removeSession(id);
        useAgentStore.getState().removeSession(id);
      }
    }

    if (removedActive && cwd) {
      const result = await this.createSession(cwd);
      registerSessionInStore(result.sessionId, cwd, result, true);
    }

    // Re-pre-warm after invalidation so the next "New Chat" is instant
    if (cwd) {
      this.preWarmForProject(cwd);
    }
  }

  /** Pre-warm a background session for the given project if config allows. */
  preWarmForProject(cwd: string): void {
    if (!useConfigStore.getState().preWarmSessions) return;

    // Check for an existing background pre-warmed session (exclude the active one)
    const existing = findPreWarmedSession(cwd);
    if (existing && existing !== useAgentStore.getState().activeSessionId) {
      log("preWarmForProject: already have a background pre-warmed session, skipping");
      return;
    }

    log("preWarmForProject: creating background session cwd=%s", cwd);
    this.createSession(cwd)
      .then(({ sessionId, commands, models, currentModel, modelScope, providerId }) => {
        log("preWarmForProject: created %s currentModel=%s", sessionId, currentModel);
        registerSessionInStore(
          sessionId,
          cwd,
          { commands, models, currentModel, modelScope, providerId },
          false,
        );
      })
      .catch((error) => {
        log(
          "preWarmForProject: FAILED error=%s",
          error instanceof Error ? error.message : String(error),
        );
      });
  }

  async #handleContextClear(
    oldSessionId: string,
    pending: import("./chat-state").PendingContextClear,
  ): Promise<void> {
    const cwd = pending.cwd;
    if (!cwd) {
      log("handleContextClear: no cwd, skipping");
      return;
    }

    try {
      // 1. Close old session
      log("handleContextClear: closing old session=%s", oldSessionId.slice(0, 8));
      await this.removeSession(oldSessionId);
      useAgentStore.getState().removeSession(oldSessionId);

      // 2. Create new session
      log("handleContextClear: creating new session cwd=%s", cwd);
      const { sessionId, commands, models, currentModel, modelScope, providerId } =
        await this.createSession(cwd);

      // 3. Register in store and set permission mode
      registerSessionInStore(
        sessionId,
        cwd,
        { commands, models, currentModel, modelScope, providerId },
        true,
      );
      useAgentStore.getState().setPermissionMode(sessionId, pending.mode);
      this.getChat(sessionId)?.dispatch({
        kind: "configure",
        configure: { type: "set_permission_mode", mode: pending.mode },
      });

      // 4. Auto-send the plan as first message
      log("handleContextClear: sending plan to new session=%s", sessionId.slice(0, 8));
      useAgentStore.getState().addUserMessage(sessionId, pending.plan);
      this.getChat(sessionId)?.sendMessage({
        text: `Implement the following plan:\n\n${pending.plan}`,
        metadata: { sessionId, parentToolUseId: null },
      });
    } catch (error) {
      log(
        "handleContextClear: FAILED error=%s",
        error instanceof Error ? error.message : String(error),
      );
      // Fallback: create a session without injecting the plan
      try {
        const { sessionId } = await this.createSession(cwd);
        registerSessionInStore(sessionId, cwd, {}, true);
      } catch {
        // give up
      }
    }
  }
}

export const claudeCodeChatManager = new ClaudeCodeChatManager(client.agent);
