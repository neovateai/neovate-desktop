import debug from "debug";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import type { RequestSummary } from "../../../shared/features/agent/request-types";
import type {
  ConversationRef,
  InboundMessage,
  InlineAction,
} from "../../../shared/features/remote-control/types";
import type { RequestTracker } from "../agent/request-tracker";
import type { SessionManager } from "../agent/session-manager";
import type { ConfigStore } from "../config/config-store";
import type { ProjectStore } from "../project/project-store";
import type { LinkStore } from "./link-store";
import type { SessionBridge, SessionActivity } from "./session-bridge";

import { APP_NAME } from "../../../shared/constants";

const log = debug("neovate:remote-control:commands");
const execFileAsync = promisify(execFile);

export type CommandResult = {
  text: string;
  actions?: InlineAction[];
};

export class CommandHandler {
  constructor(
    private sessionManager: SessionManager,
    private projectStore: ProjectStore,
    private linkStore: LinkStore,
    private requestTracker: RequestTracker,
    private configStore: ConfigStore,
    private bridge: SessionBridge,
    private maxMessageLength = 4096,
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
        return this.handleStart(msg.ref);
      case "/chats":
        return this.handleChats(msg.ref);
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

  private async handleStart(ref: ConversationRef): Promise<CommandResult> {
    const sessions = await this.getEnrichedSessions(ref);
    if (sessions.length === 0) {
      return {
        text: `Welcome to ${APP_NAME}! No active sessions. Use /new to create one, or /repos to browse projects.`,
      };
    }

    const lines = this.formatSessionList(sessions);
    return {
      text: this.truncateResponse(
        `Welcome to ${APP_NAME}! ${sessions.length} active session(s).\n\n${lines}`,
      ),
      actions: sessions.map((s) => ({
        label: s.title ?? shortenPath(s.cwd),
        callbackData: `session:select:${s.sessionId}`,
      })),
    };
  }

  private async handleChats(ref: ConversationRef): Promise<CommandResult> {
    const sessions = await this.getEnrichedSessions(ref);
    if (sessions.length === 0) {
      return { text: "No active sessions. Use /new to create one." };
    }

    const lines = this.formatSessionList(sessions);
    return {
      text: this.truncateResponse(`Active sessions:\n\n${lines}`),
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

    const activeSessions = this.sessionManager.getActiveSessions();
    const lines = projects.slice(0, 20).map((p) => {
      const count = activeSessions.filter((s) => s.cwd === p.path).length;
      const suffix =
        count === 0
          ? "no active sessions"
          : count === 1
            ? "1 active session"
            : `${count} active sessions`;
      return `\u2022 ${shortenPath(p.path)} \u2014 ${suffix}`;
    });

    return {
      text: this.truncateResponse(`Projects:\n\n${lines.join("\n")}`),
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

  private async handleStatus(ref: ConversationRef): Promise<CommandResult> {
    const sessionId = this.linkStore.getSessionId(ref);
    if (!sessionId) {
      return this.handleUnlinkedStatus();
    }

    const sessions = this.sessionManager.getActiveSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (!session) {
      this.linkStore.remove(ref);
      return this.handleUnlinkedStatus();
    }

    const sections: string[] = [];

    // Project + git branch
    const projectName = lastPathSegment(session.cwd);
    const branch = await gitBranch(session.cwd);
    sections.push(
      branch ? `\ud83d\udccd ${projectName} (${branch})` : `\ud83d\udccd ${projectName}`,
    );

    // Model + provider
    const model = this.resolveModel(sessionId, session.model);
    const providerName = session.providerId
      ? (this.configStore.getProvider(session.providerId)?.name ?? null)
      : null;
    if (model) {
      const modelLabel = shortModelName(model);
      sections.push(
        providerName
          ? `\ud83e\udd16 ${modelLabel} via ${providerName}`
          : `\ud83e\udd16 ${modelLabel}`,
      );
    }

    // Uptime + activity
    const activity = this.bridge.getSessionActivity(sessionId);
    const uptime = formatUptime(session.createdAt);
    const activityLabel = formatActivity(activity);
    sections.push(`\u23f1 Active ${uptime} \u00b7 ${activityLabel}`);

    // Context + output tokens
    const contextUsage = this.bridge.getContextUsage(sessionId);
    if (contextUsage) {
      sections.push(
        `\ud83d\udcca Context: ${contextUsage.remainingPct}% remaining (${formatTokens(contextUsage.usedTokens)})`,
      );
    }
    const outputTokens = getCumulativeOutputTokens(this.requestTracker.getRequests(sessionId));
    if (outputTokens > 0) {
      sections.push(`\ud83d\udcca Output: ${formatTokens(outputTokens)}`);
    }

    // Recent messages
    const recent = this.bridge.getRecentMessages(sessionId);
    if (recent.length > 0) {
      const recentLines = recent.map((m) => `> [${m.role}] ${m.text}`).join("\n");
      sections.push(`\n\ud83d\udcac Recent:\n${recentLines}`);
    }

    const actions: InlineAction[] = [
      { label: "Stop", callbackData: `perm:stop:${sessionId}` },
      { label: "Unlink", callbackData: `session:unlink:${sessionId}` },
    ];

    return {
      text: this.truncateResponse(sections.join("\n"), recent.length > 0),
      actions,
    };
  }

  private handleUnlinkedStatus(): CommandResult {
    const sessions = this.sessionManager.getActiveSessions();
    if (sessions.length === 0) {
      return { text: "No session linked. No active sessions. Use /new to create one." };
    }

    let idle = 0;
    let working = 0;
    for (const s of sessions) {
      const activity = this.bridge.getSessionActivity(s.sessionId);
      if (activity.state === "idle") idle++;
      else working++;
    }

    const parts: string[] = [];
    if (idle > 0) parts.push(`${idle} idle`);
    if (working > 0) parts.push(`${working} working`);

    return {
      text: `No session linked.\n${sessions.length} active session${sessions.length > 1 ? "s" : ""}: ${parts.join(", ")}\nUse /chats to connect.`,
    };
  }

  private handleStop(ref: ConversationRef): CommandResult {
    const sessionId = this.linkStore.getSessionId(ref);
    if (!sessionId) {
      return { text: "No session linked. Use /chats first." };
    }

    const sessions = this.sessionManager.getActiveSessions();
    const session = sessions.find((s) => s.sessionId === sessionId);

    // Capture activity before interrupting
    const activity = this.bridge.getSessionActivity(sessionId);

    try {
      void this.sessionManager.handleDispatch(sessionId, { kind: "interrupt" });

      const projectName = session ? lastPathSegment(session.cwd) : "unknown";
      const lines = [`Stopped session in ${projectName}.`];
      if (activity.state !== "idle" && activity.detail) {
        lines.push(`Was: ${activity.detail}`);
      }
      lines.push("Session is now idle.");
      return { text: lines.join("\n") };
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
        "/chats \u2014 List active sessions with status",
        "/repos \u2014 List projects with session counts",
        "/branches <project> \u2014 List branches",
        "/new [project] \u2014 Create new session",
        "/status \u2014 Detailed session dashboard",
        "/stop \u2014 Abort current turn",
        "/help \u2014 This message",
      ].join("\n"),
    };
  }

  // ── Enriched session data ──

  private async getEnrichedSessions(ref: ConversationRef): Promise<EnrichedSession[]> {
    const active = this.sessionManager.getActiveSessions();
    if (active.length === 0) return [];

    const linkedSessionId = this.linkStore.getSessionId(ref);

    // Get titles
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
      model: this.resolveModel(s.sessionId, s.model),
      activity: this.bridge.getSessionActivity(s.sessionId),
      uptime: formatUptime(s.createdAt),
      linked: s.sessionId === linkedSessionId,
    }));
  }

  private formatSessionList(sessions: EnrichedSession[]): string {
    return sessions
      .map((s, i) => {
        const indicator = activityIndicator(s.activity);
        const label = s.title ?? shortenPath(s.cwd);
        const linkedMark = s.linked ? " \u2190 linked" : "";
        const projectName = lastPathSegment(s.cwd);
        const modelLabel = s.model ? shortModelName(s.model) : null;

        const meta = [projectName, modelLabel, s.uptime].filter(Boolean).join(" \u00b7 ");
        const activitySuffix =
          s.activity.state !== "idle" ? ` \u00b7 ${formatActivity(s.activity)}` : "";

        return `${i + 1}. ${indicator} ${label}${linkedMark}\n   ${meta}${activitySuffix}`;
      })
      .join("\n\n");
  }

  private resolveModel(sessionId: string, sessionModel?: string): string | null {
    // Try RequestTracker for most recent model (may have changed mid-session)
    const requests = this.requestTracker.getRequests(sessionId);
    for (let i = requests.length - 1; i >= 0; i--) {
      if (requests[i].phase === "end" && requests[i].model) {
        return requests[i].model!;
      }
    }
    // Fall back to model stored at creation time
    return sessionModel ?? null;
  }

  /** Truncate response to fit within maxMessageLength. Drops trailing sections first. */
  private truncateResponse(text: string, hasRecentSection = false): string {
    if (text.length <= this.maxMessageLength) return text;

    // Drop "Recent" section if present
    if (hasRecentSection) {
      const recentIdx = text.lastIndexOf("\n\ud83d\udcac Recent:");
      if (recentIdx > 0) {
        const trimmed = text.slice(0, recentIdx);
        if (trimmed.length <= this.maxMessageLength) return trimmed;
      }
    }

    // Hard truncate
    return text.slice(0, this.maxMessageLength - 4) + " ...";
  }
}

type EnrichedSession = {
  sessionId: string;
  cwd: string;
  title?: string;
  model: string | null;
  activity: SessionActivity;
  uptime: string;
  linked: boolean;
};

// ── Helpers ──

function shortenPath(p: string): string {
  const parts = p.split("/");
  return parts.length > 2 ? parts.slice(-2).join("/") : p;
}

function lastPathSegment(p: string): string {
  const parts = p.split("/");
  return parts[parts.length - 1] || p;
}

async function gitBranch(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd,
      timeout: 3000,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

function getCumulativeOutputTokens(requests: RequestSummary[]): number {
  let total = 0;
  for (const r of requests) {
    if (r.phase === "end" && r.usage) {
      total += r.usage.outputTokens;
    }
  }
  return total;
}

function formatUptime(createdAt: number): string {
  const elapsed = Math.max(0, Date.now() - createdAt);
  const minutes = Math.floor(elapsed / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function shortModelName(model: string): string {
  return model.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function formatActivity(activity: SessionActivity): string {
  if (activity.state === "idle") return "Idle";
  if (activity.state === "tool" && activity.detail) return activity.detail;
  return "Thinking...";
}

function activityIndicator(activity: SessionActivity): string {
  if (activity.state === "idle") return "\ud83d\udfe2";
  return "\ud83d\udfe1";
}
