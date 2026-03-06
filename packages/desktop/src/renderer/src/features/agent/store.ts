import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";
import type {
  SessionInfo,
  UIMessagePart,
  TimingEntry,
  SlashCommandInfo,
  CachedSession,
  UIMessage,
  DynamicToolPart,
} from "../../../../shared/features/agent/types";
import type { ClaudeCodeToolName } from "../../../../shared/features/agent/tools";
import { getParentToolUseId } from "../../../../shared/features/agent/types";
import debug from "debug";

const storeLog = debug("neovate:agent-store");

enableMapSet();

/**
 * @deprecated Tool state is now embedded in `UIMessage.parts` as `DynamicToolPart`.
 */
export type ToolCallState = {
  toolCallId: string;
  name: string;
  status?: string;
  input?: unknown;
};

export type PendingPermission = {
  requestId: string;
  toolName: string;
  input: unknown;
};

export type TaskState = {
  taskId: string;
  description: string;
  taskType?: string;
  status: "running" | "completed" | "failed" | "stopped";
  toolUses?: number;
  durationMs?: number;
  lastToolName?: string;
  summary?: string;
};

export type SessionUsage = {
  totalCostUsd: number;
  totalDurationMs: number;
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type ChatSession = {
  sessionId: string;
  cwd?: string;
  title?: string;
  createdAt: string;
  isNew: boolean;
  /** Parts-based message list for rendering. */
  messages: UIMessage[];
  streaming: boolean;
  promptError: string | null;
  pendingPermission: PendingPermission | null;
  availableCommands: SlashCommandInfo[];
  sdkReady: boolean;
  usage?: SessionUsage;
  tasks: Map<string, TaskState>;
};

// ---------------------------------------------------------------------------
// Selector helpers
// ---------------------------------------------------------------------------

/** Extract all dynamic tool parts from a UI message. */
export function selectToolParts(message: UIMessage): DynamicToolPart[] {
  return message.parts.filter((p): p is DynamicToolPart => p.type === "dynamic-tool");
}

/** Extract the concatenated text content from a UI message. */
export function selectTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");
}

/** Extract child tool parts belonging to a given parent tool call. */
export function selectChildToolParts(
  message: UIMessage,
  parentToolCallId: string,
): DynamicToolPart[] {
  return message.parts.filter(
    (p): p is DynamicToolPart =>
      p.type === "dynamic-tool" && getParentToolUseId(p) === parentToolCallId,
  );
}

// ---------------------------------------------------------------------------
// Cache migration
// ---------------------------------------------------------------------------

/**
 * Old cached message format (before parts refactor).
 */
type LegacyCachedMessage = {
  id: string;
  role: "user" | "assistant";
  content?: string;
  toolCalls?: Array<{
    toolCallId: string;
    name: string;
    status?: string;
    input?: unknown;
  }>;
};

/**
 * Migrates legacy cached messages to the new parts-based format.
 * Also migrates old tool-invocation parts to dynamic-tool.
 */
function migrateCachedMessage(msg: LegacyCachedMessage & Partial<UIMessage>): UIMessage {
  // If no parts, build from legacy content/toolCalls
  if (!msg.parts) {
    const parts: UIMessage["parts"] = [];

    // Add text part from content
    if (msg.content) {
      parts.push({ type: "text", text: msg.content });
    }

    // Add dynamic-tool parts from toolCalls
    if (msg.toolCalls) {
      for (const tc of msg.toolCalls) {
        if (tc.status === "completed") {
          parts.push({
            type: "dynamic-tool",
            toolCallId: tc.toolCallId,
            toolName: tc.name as ClaudeCodeToolName,
            state: "output-available",
            input: tc.input,
            output: tc.input,
          });
        } else {
          parts.push({
            type: "dynamic-tool",
            toolCallId: tc.toolCallId,
            toolName: tc.name as ClaudeCodeToolName,
            state: "input-available",
            input: tc.input,
          });
        }
      }
    }

    return {
      id: msg.id,
      role: msg.role,
      parts,
    };
  }

  // Migrate old tool-invocation parts to dynamic-tool
  const migratedParts = msg.parts.map((part): UIMessage["parts"][number] => {
    if ((part as { type: string }).type === "tool-invocation") {
      const oldPart = part as unknown as {
        type: "tool-invocation";
        toolCallId: string;
        toolName: string;
        state: string;
        input: unknown;
        output?: string;
        errorText?: string;
        parentToolUseId?: string;
      };
      // Convert to dynamic-tool format
      const result: Record<string, unknown> = {
        type: "dynamic-tool",
        toolCallId: oldPart.toolCallId,
        toolName: oldPart.toolName,
        state: oldPart.state,
        input: oldPart.input,
      };
      if (oldPart.output !== undefined) {
        result.output = oldPart.output;
      }
      if (oldPart.errorText !== undefined) {
        result.errorText = oldPart.errorText;
      }
      // Migrate parentToolUseId to callProviderMetadata.context
      if (oldPart.parentToolUseId) {
        result.callProviderMetadata = {
          context: { parentToolUseId: oldPart.parentToolUseId },
        };
      }
      return result as DynamicToolPart;
    }
    return part;
  });

  return {
    id: msg.id,
    role: msg.role,
    parts: migratedParts,
  };
}

type AgentState = {
  sessions: Map<string, ChatSession>;
  activeSessionId: string | null;
  agentSessions: SessionInfo[];
  timings: TimingEntry[];
  _nextMessageId: number;

  setActiveSession: (sessionId: string | null) => void;
  setAgentSessions: (sessions: SessionInfo[]) => void;
  createSession: (
    sessionId: string,
    meta?: { title?: string; createdAt?: string; cwd?: string; isNew?: boolean },
  ) => void;
  createBackgroundSession: (
    sessionId: string,
    meta?: { title?: string; createdAt?: string; cwd?: string; isNew?: boolean },
  ) => void;
  removeSession: (sessionId: string) => void;
  addUserMessage: (
    sessionId: string,
    content: string,
    images?: Array<{ mediaType: string; base64: string }>,
  ) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setPromptError: (sessionId: string, error: string | null) => void;
  setPendingPermission: (sessionId: string, perm: PendingPermission | null) => void;
  setAvailableCommands: (sessionId: string, commands: SlashCommandInfo[]) => void;
  appendChunk: (sessionId: string, part: UIMessagePart) => void;
  restoreFromCache: (sessionId: string, cached: CachedSession) => void;
  setSdkReady: (sessionId: string, ready: boolean) => void;
  addTiming: (entry: TimingEntry) => void;
  clearTimings: () => void;
};

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    sessions: new Map(),
    activeSessionId: null,
    agentSessions: [],
    timings: [],
    _nextMessageId: 0,

    setActiveSession: (sessionId) => {
      storeLog("setActiveSession: %s", sessionId);
      set({ activeSessionId: sessionId });
    },

    setAgentSessions: (agentSessions) => {
      storeLog("setAgentSessions: count=%d", agentSessions.length);
      set({ agentSessions });
    },

    createSession: (sessionId, meta) => {
      storeLog("createSession: sid=%s meta=%o", sessionId, meta);
      set((state) => {
        state.sessions.set(sessionId, {
          sessionId,
          cwd: meta?.cwd,
          title: meta?.title,
          createdAt: meta?.createdAt ?? new Date().toISOString(),
          isNew: meta?.isNew ?? false,
          messages: [],
          streaming: false,
          promptError: null,
          pendingPermission: null,
          availableCommands: [],
          sdkReady: true,
          tasks: new Map(),
        });
        state.activeSessionId = sessionId;
        storeLog("createSession: totalSessions=%d active=%s", state.sessions.size, sessionId);
      });
    },

    createBackgroundSession: (sessionId, meta) => {
      storeLog("createBackgroundSession: sid=%s meta=%o", sessionId, meta);
      set((state) => {
        state.sessions.set(sessionId, {
          sessionId,
          cwd: meta?.cwd,
          title: meta?.title,
          createdAt: meta?.createdAt ?? new Date().toISOString(),
          isNew: meta?.isNew ?? false,
          messages: [],
          streaming: false,
          promptError: null,
          pendingPermission: null,
          availableCommands: [],
          sdkReady: true,
          tasks: new Map(),
        });
        storeLog("createBackgroundSession: totalSessions=%d (not activated)", state.sessions.size);
      });
    },

    removeSession: (sessionId) => {
      storeLog("removeSession: sid=%s", sessionId);
      set((state) => {
        state.sessions.delete(sessionId);
        if (state.activeSessionId === sessionId) {
          state.activeSessionId = null;
        }
        storeLog(
          "removeSession: totalSessions=%d active=%s",
          state.sessions.size,
          state.activeSessionId,
        );
      });
    },

    addUserMessage: (sessionId, content, images) => {
      storeLog(
        "addUserMessage: sid=%s len=%d images=%d",
        sessionId,
        content.length,
        images?.length ?? 0,
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog("addUserMessage: WARNING session not found sid=%s", sessionId);
          return;
        }
        session.isNew = false;
        if (!session.title) {
          session.title = content.slice(0, 50);
        }
        state._nextMessageId += 1;
        const msgId = String(state._nextMessageId);
        session.messages.push({
          id: msgId,
          role: "user",
          parts: [
            {
              type: "text",
              text: content,
              ...(images && images.length > 0 ? { images } : {}),
            },
          ],
        });
        storeLog("addUserMessage: msgCount=%d msgId=%s", session.messages.length, msgId);
      });
    },

    setStreaming: (sessionId, streaming) => {
      storeLog("setStreaming: sid=%s streaming=%s", sessionId, streaming);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.streaming = streaming;
      });
    },

    setPromptError: (sessionId, promptError) => {
      storeLog("setPromptError: sid=%s error=%s", sessionId, promptError);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.promptError = promptError;
      });
    },

    setPendingPermission: (sessionId, perm) => {
      storeLog(
        "setPendingPermission: sid=%s perm=%o",
        sessionId,
        perm ? { requestId: perm.requestId, toolName: perm.toolName } : null,
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.pendingPermission = perm;
      });
    },

    setAvailableCommands: (sessionId, commands) => {
      storeLog(
        "setAvailableCommands: sid=%s commands=%o",
        sessionId,
        commands.map((c) => c.name),
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.availableCommands = commands;
      });
    },

    addTiming: (entry) => {
      storeLog(
        "addTiming: phase=%s label=%s durationMs=%d",
        entry.phase,
        entry.label,
        entry.durationMs,
      );
      set((state) => {
        state.timings.push(entry);
      });
    },

    clearTimings: () => set({ timings: [] }),

    restoreFromCache: (sessionId, cached) => {
      storeLog(
        "restoreFromCache: sid=%s msgs=%d title=%s",
        sessionId,
        cached.messages.length,
        cached.title,
      );
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog("restoreFromCache: WARNING session not found sid=%s", sessionId);
          return;
        }
        session.messages = cached.messages.map((m) => {
          state._nextMessageId += 1;
          // TODO: Migrate legacy format (content/toolCalls) to parts-based format
          const migrated = migrateCachedMessage(m as Parameters<typeof migrateCachedMessage>[0]);
          return { ...migrated, id: String(state._nextMessageId) };
        });
        if (cached.title) session.title = cached.title;
        if (cached.cwd) session.cwd = cached.cwd;
        if (cached.usage) session.usage = cached.usage;
        session.sdkReady = false;
      });
    },

    setSdkReady: (sessionId, ready) => {
      storeLog("setSdkReady: sid=%s ready=%s", sessionId, ready);
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (session) session.sdkReady = ready;
      });
    },

    appendChunk: (sessionId, part) => {
      set((state) => {
        const session = state.sessions.get(sessionId);
        if (!session) {
          storeLog(
            "appendChunk: WARNING session not found sid=%s eventType=%s",
            sessionId,
            part.type,
          );
          return;
        }

        // ── Helper: get or create the last assistant UIMessage ──
        const getOrCreateAssistantMsg = () => {
          const last = session.messages[session.messages.length - 1];
          if (last && last.role === "assistant") return last;
          state._nextMessageId += 1;
          const msg: UIMessage = {
            id: `am-${state._nextMessageId}`,
            role: "assistant",
            parts: [],
          };
          session.messages.push(msg);
          return msg;
        };

        // ── Handle DataUIPart types (data-*) ──
        if (part.type.startsWith("data-")) {
          switch (part.type) {
            case "data-timing":
              storeLog(
                "appendChunk: data-timing phase=%s label=%s durationMs=%d",
                part.data.phase,
                part.data.label,
                part.data.durationMs,
              );
              state.timings.push(part.data);
              break;

            case "data-permission-request":
              storeLog(
                "appendChunk: data-permission-request requestId=%s tool=%s",
                part.data.requestId,
                part.data.toolName,
              );
              session.pendingPermission = {
                requestId: part.data.requestId,
                toolName: part.data.toolName,
                input: part.data.input,
              };
              break;

            case "data-available-commands":
              storeLog(
                "appendChunk: data-available-commands sid=%s count=%d names=%o",
                sessionId,
                part.data.commands.length,
                part.data.commands.map((c) => c.name),
              );
              session.availableCommands = part.data.commands;
              break;

            case "data-result":
              storeLog(
                "appendChunk: data-result stopReason=%s sid=%s",
                part.data.stopReason,
                sessionId,
              );
              if (part.data.stopReason === "error") {
                session.promptError = "Session failed to load";
              }
              if (
                part.data.costUsd != null ||
                part.data.inputTokens != null ||
                part.data.outputTokens != null
              ) {
                if (!session.usage) {
                  session.usage = {
                    totalCostUsd: 0,
                    totalDurationMs: 0,
                    totalInputTokens: 0,
                    totalOutputTokens: 0,
                  };
                }
                session.usage.totalCostUsd += part.data.costUsd ?? 0;
                session.usage.totalDurationMs += part.data.durationMs ?? 0;
                session.usage.totalInputTokens += part.data.inputTokens ?? 0;
                session.usage.totalOutputTokens += part.data.outputTokens ?? 0;
              }
              break;

            case "data-status":
              storeLog("appendChunk: data-status message=%s sid=%s", part.data.message, sessionId);
              break;

            case "data-task-started":
              storeLog(
                "appendChunk: data-task-started id=%s desc=%s",
                part.data.taskId,
                part.data.description,
              );
              session.tasks.set(part.data.taskId, {
                taskId: part.data.taskId,
                description: part.data.description,
                taskType: part.data.taskType,
                status: "running",
              });
              break;

            case "data-task-progress":
              storeLog(
                "appendChunk: data-task-progress id=%s tools=%d",
                part.data.taskId,
                part.data.toolUses,
              );
              {
                const task = session.tasks.get(part.data.taskId);
                if (task) {
                  task.description = part.data.description;
                  task.toolUses = part.data.toolUses;
                  task.durationMs = part.data.durationMs;
                  task.lastToolName = part.data.lastToolName;
                }
              }
              break;

            case "data-task-notification":
              storeLog(
                "appendChunk: data-task-notification id=%s status=%s",
                part.data.taskId,
                part.data.status,
              );
              {
                const task = session.tasks.get(part.data.taskId);
                if (task) {
                  task.status = part.data.status as "completed" | "failed" | "stopped";
                  task.summary = part.data.summary;
                }
              }
              break;

            default:
              storeLog("appendChunk: unhandled data type=%s", part.type);
          }
          return;
        }

        // ── Handle content types (text, reasoning, file, dynamic-tool) ──
        switch (part.type) {
          case "text": {
            // Merge streaming text into last text part, or create new
            const amMsg = getOrCreateAssistantMsg();
            const lastPart = amMsg.parts[amMsg.parts.length - 1];
            if (lastPart && lastPart.type === "text" && lastPart.state === "streaming") {
              lastPart.text += part.text;
            } else {
              amMsg.parts.push({ type: "text", text: part.text, state: part.state });
            }
            break;
          }

          case "reasoning": {
            // Merge streaming reasoning into last reasoning part, or create new
            const amMsg = getOrCreateAssistantMsg();
            const lastPart = amMsg.parts[amMsg.parts.length - 1];
            if (lastPart && lastPart.type === "reasoning" && lastPart.state === "streaming") {
              lastPart.text += part.text;
            } else {
              amMsg.parts.push({ type: "reasoning", text: part.text, state: part.state });
            }
            break;
          }

          case "dynamic-tool": {
            storeLog(
              "appendChunk: dynamic-tool id=%s name=%s state=%s",
              part.toolCallId,
              part.toolName,
              part.state,
            );
            if (part.state === "output-available" || part.state === "output-error") {
              // Find and update existing tool part
              for (const msg of session.messages) {
                for (const p of msg.parts) {
                  if (p.type === "dynamic-tool" && p.toolCallId === part.toolCallId) {
                    p.state = part.state;
                    if (part.state === "output-available") p.output = part.output;
                    else p.errorText = part.errorText;
                    break;
                  }
                }
              }
            } else {
              // Add new tool invocation - push the whole part
              const amMsg = getOrCreateAssistantMsg();
              amMsg.parts.push(part);
            }
            break;
          }

          case "file": {
            // File parts usually belong to user messages or assistant messages
            storeLog("appendChunk: file mediaType=%s", part.mediaType);
            const amMsg = getOrCreateAssistantMsg();
            amMsg.parts.push({
              type: "file",
              mediaType: part.mediaType,
              url: part.url,
              filename: part.filename,
            });
            break;
          }

          default:
            // Handle legacy StreamEvent types from old cached data
            const legacyType = (part as any).type;
            storeLog("appendChunk: handling legacy type=%s", legacyType);

            switch (legacyType) {
              case "text_delta": {
                const amMsg = getOrCreateAssistantMsg();
                const lastPart = amMsg.parts[amMsg.parts.length - 1];
                if (lastPart && lastPart.type === "text" && lastPart.state === "streaming") {
                  lastPart.text += (part as any).text;
                } else {
                  amMsg.parts.push({ type: "text", text: (part as any).text, state: "streaming" });
                }
                break;
              }

              case "thinking_delta": {
                const amMsg = getOrCreateAssistantMsg();
                const lastPart = amMsg.parts[amMsg.parts.length - 1];
                if (lastPart && lastPart.type === "reasoning" && lastPart.state === "streaming") {
                  lastPart.text += (part as any).text;
                } else {
                  amMsg.parts.push({
                    type: "reasoning",
                    text: (part as any).text,
                    state: "streaming",
                  });
                }
                break;
              }

              case "tool_use": {
                const amMsg = getOrCreateAssistantMsg();
                amMsg.parts.push({
                  type: "dynamic-tool",
                  toolCallId: (part as any).toolUseId,
                  toolName: (part as any).name,
                  state: "input-available",
                  input: (part as any).input,
                });
                break;
              }

              case "tool_input_available": {
                const amMsg = getOrCreateAssistantMsg();
                amMsg.parts.push({
                  type: "dynamic-tool",
                  toolCallId: (part as any).toolCallId,
                  toolName: (part as any).toolName,
                  state: "input-available",
                  input: (part as any).input,
                });
                break;
              }

              case "tool_output_available": {
                // Find and update existing tool part
                for (const msg of session.messages) {
                  for (const p of msg.parts) {
                    if (p.type === "dynamic-tool" && p.toolCallId === (part as any).toolCallId) {
                      p.state = "output-available";
                      (p as any).output = (part as any).output;
                      break;
                    }
                  }
                }
                break;
              }

              case "timing": {
                state.timings.push({
                  phase: (part as any).phase,
                  label: (part as any).label,
                  durationMs: (part as any).durationMs,
                  timestamp: (part as any).timestamp ?? Date.now(),
                });
                break;
              }

              default:
                storeLog("appendChunk: unhandled legacy part type=%s", legacyType);
            }
        }
      });
    },
  })),
);
