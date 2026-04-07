import debug from "debug";

import type {
  ConversationRef,
  InboundMessage,
  InlineAction,
} from "../../../shared/features/remote-control/types";
import type { SessionManager } from "../agent/session-manager";
import type { ProjectStore } from "../project/project-store";
import type { LinkStore } from "./link-store";

const log = debug("neovate:remote-control:commands");

export type CommandResult = {
  text: string;
  actions?: InlineAction[];
};

export class CommandHandler {
  constructor(
    private sessionManager: SessionManager,
    private projectStore: ProjectStore,
    private linkStore: LinkStore,
  ) {}

  /** Returns a CommandResult if the message is a command, null otherwise. */
  async handle(msg: InboundMessage): Promise<CommandResult | null> {
    const text = msg.text.trim();
    if (!text.startsWith("/")) return null;

    const [cmd, ...args] = text.split(/\s+/);
    const arg = args.join(" ");

    log("command: %s from chat %s (args: %s)", cmd, msg.ref.chatId, arg || "(none)");

    switch (cmd) {
      case "/start":
        return this.handleStart();
      case "/chats":
        return this.handleChats();
      case "/repos":
        return this.handleRepos();
      case "/branches":
        return this.handleBranches(arg);
      case "/status":
        return this.handleStatus(msg.ref);
      case "/stop":
        return this.handleStop(msg.ref);
      case "/new":
        return this.handleNew(arg);
      case "/help":
        return this.handleHelp();
      default:
        return { text: `Unknown command: ${cmd}. Use /help for available commands.` };
    }
  }

  private async handleStart(): Promise<CommandResult> {
    const sessions = await this.getSessionsWithTitles();
    if (sessions.length === 0) {
      return {
        text: "Welcome to Neovate! No active sessions. Use /new to create one, or /repos to browse projects.",
      };
    }

    return {
      text: `Welcome to Neovate! ${sessions.length} active session(s). Pick one to connect:`,
      actions: sessions.map((s) => ({
        label: s.title ?? shortenPath(s.cwd),
        callbackData: `session:select:${s.sessionId}`,
      })),
    };
  }

  private async handleChats(): Promise<CommandResult> {
    const sessions = await this.getSessionsWithTitles();
    if (sessions.length === 0) {
      return { text: "No active sessions. Use /new to create one." };
    }

    return {
      text: "Active sessions:",
      actions: sessions.map((s) => ({
        label: s.title ?? shortenPath(s.cwd),
        callbackData: `session:select:${s.sessionId}`,
      })),
    };
  }

  private handleRepos(): CommandResult {
    const projects = this.projectStore.getAll();
    if (projects.length === 0) {
      return { text: "No projects found." };
    }

    return {
      text: "Projects:",
      actions: projects.slice(0, 20).map((p) => ({
        label: shortenPath(p.path),
        callbackData: `project:select:${p.id}`,
      })),
    };
  }

  private handleBranches(projectArg: string): CommandResult {
    if (!projectArg) {
      return { text: "Usage: /branches <project>" };
    }

    const projects = this.projectStore.getAll();
    const match = projects.filter((p) => p.path.toLowerCase().includes(projectArg.toLowerCase()));

    if (match.length === 0) {
      return { text: `No project found matching "${projectArg}".` };
    }
    if (match.length > 1) {
      return {
        text: `Multiple projects match "${projectArg}". Pick one:`,
        actions: match.slice(0, 10).map((p) => ({
          label: shortenPath(p.path),
          callbackData: `project:branches:${p.id}`,
        })),
      };
    }

    return { text: `Project: ${shortenPath(match[0].path)}\nBranch listing coming soon.` };
  }

  private handleStatus(ref: ConversationRef): CommandResult {
    const sessionId = this.linkStore.getSessionId(ref);
    if (!sessionId) {
      return { text: "No session linked to this chat. Use /chats to pick one." };
    }

    const sessions = this.sessionManager.getActiveSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      this.linkStore.remove(ref);
      return { text: "Linked session no longer exists. Use /chats to pick a new one." };
    }

    return { text: `Linked to session in: ${session.cwd}\nSession ID: ${sessionId}` };
  }

  private handleStop(ref: ConversationRef): CommandResult {
    const sessionId = this.linkStore.getSessionId(ref);
    if (!sessionId) {
      return { text: "No session linked. Use /chats first." };
    }

    try {
      void this.sessionManager.handleDispatch(sessionId, { kind: "interrupt" });
      return { text: "Turn aborted." };
    } catch (err) {
      log("interrupt failed: %O", err);
      return { text: "Failed to stop the current turn." };
    }
  }

  private handleNew(projectArg: string): CommandResult {
    if (!projectArg) {
      const projects = this.projectStore.getAll();
      if (projects.length === 0) {
        return { text: "No projects found. Create a project in the desktop app first." };
      }
      return {
        text: "Pick a project for the new session:",
        actions: projects.slice(0, 20).map((p) => ({
          label: shortenPath(p.path),
          callbackData: `session:new:${p.id}`,
        })),
      };
    }

    const projects = this.projectStore.getAll();
    const matches = projects.filter((p) => p.path.toLowerCase().includes(projectArg.toLowerCase()));

    if (matches.length === 0) {
      return { text: `No project found matching "${projectArg}".` };
    }
    if (matches.length > 1) {
      return {
        text: `Multiple projects match "${projectArg}". Pick one:`,
        actions: matches.slice(0, 10).map((p) => ({
          label: shortenPath(p.path),
          callbackData: `session:new:${p.id}`,
        })),
      };
    }

    return {
      text: `Creating session in ${shortenPath(matches[0].path)}...`,
      actions: [{ label: "Confirm", callbackData: `session:new:${matches[0].id}` }],
    };
  }

  private handleHelp(): CommandResult {
    return {
      text: [
        "Available commands:",
        "/chats — List active sessions",
        "/repos — List projects",
        "/branches <project> — List branches",
        "/new [project] — Create new session",
        "/status — Current session status",
        "/stop — Abort current turn",
        "/help — This message",
      ].join("\n"),
    };
  }

  /** Get active sessions with titles from listSessions(). */
  private async getSessionsWithTitles(): Promise<
    Array<{ sessionId: string; cwd: string; title?: string }>
  > {
    const active = this.sessionManager.getActiveSessions();
    if (active.length === 0) return [];

    // listSessions across all active cwds to get titles
    const cwds = [...new Set(active.map((s) => s.cwd))];
    const allPersisted = await Promise.all(
      cwds.map((cwd) => this.sessionManager.listSessions(cwd)),
    );
    const titleMap = new Map<string, string>();
    for (const sessions of allPersisted) {
      for (const s of sessions) {
        if (s.title) titleMap.set(s.sessionId, s.title);
      }
    }

    return active.map((s) => ({
      sessionId: s.sessionId,
      cwd: s.cwd,
      title: titleMap.get(s.sessionId),
    }));
  }
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 2 ? parts.slice(-2).join("/") : p;
}
