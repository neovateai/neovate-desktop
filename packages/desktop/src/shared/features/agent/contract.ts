import { oc, type, eventIterator } from "@orpc/contract";
import { z } from "zod";
import type {
  SessionInfo,
  StreamEvent,
  LoadSessionResult,
  PromptResult,
  SlashCommandInfo,
  AgentInfo,
  ModelInfo,
  AccountInfo,
  FastModeState,
  PermissionMode,
  RewindFilesResult,
  McpServerConfig,
  McpServerStatus,
  McpSetServersResult,
} from "./types";

const promptErrorDataSchema = type<{
  source: "agent";
  message: string;
}>();

export const agentContract = {
  listSessions: oc.input(z.object({ cwd: z.string().optional() })).output(type<SessionInfo[]>()),

  newSession: oc.input(z.object({ cwd: z.string(), model: z.string().optional() })).output(
    type<{
      sessionId: string;
      currentModel?: string;
      commands?: SlashCommandInfo[];
      agents?: AgentInfo[];
      models?: ModelInfo[];
      account?: AccountInfo;
      outputStyle?: string;
      availableOutputStyles?: string[];
      fastModeState?: FastModeState;
    }>(),
  ),

  loadSession: oc
    .input(
      z.object({
        sessionId: z.string(),
        cwd: z.string().optional(),
      }),
    )
    .output(eventIterator(type<StreamEvent>(), type<LoadSessionResult>())),

  prompt: oc
    .input(
      z.object({
        sessionId: z.string(),
        prompt: z.string(),
        attachments: z
          .array(
            z.object({
              id: z.string(),
              filename: z.string(),
              mediaType: z.string(),
              base64: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .errors({
      BAD_GATEWAY: {
        message: "Agent prompt failed",
        data: promptErrorDataSchema,
      },
    })
    .output(eventIterator(type<StreamEvent>(), type<PromptResult>())),

  resolvePermission: oc
    .input(z.object({ requestId: z.string(), allow: z.boolean() }))
    .output(type<void>()),

  cancel: oc.input(z.object({ sessionId: z.string() })).output(type<void>()),

  setPermissionMode: oc
    .input(
      z.object({ sessionId: z.string(), mode: z.string().transform((v) => v as PermissionMode) }),
    )
    .output(type<void>()),

  setModel: oc
    .input(z.object({ sessionId: z.string(), model: z.string().optional() }))
    .output(type<void>()),

  setMaxThinkingTokens: oc
    .input(z.object({ sessionId: z.string(), maxThinkingTokens: z.number().nullable() }))
    .output(type<void>()),

  stopTask: oc.input(z.object({ sessionId: z.string(), taskId: z.string() })).output(type<void>()),

  rewindFiles: oc
    .input(
      z.object({
        sessionId: z.string(),
        userMessageId: z.string(),
        dryRun: z.boolean().optional(),
      }),
    )
    .output(type<RewindFilesResult>()),

  mcpServerStatus: oc.input(z.object({ sessionId: z.string() })).output(type<McpServerStatus[]>()),

  reconnectMcpServer: oc
    .input(z.object({ sessionId: z.string(), serverName: z.string() }))
    .output(type<void>()),

  toggleMcpServer: oc
    .input(z.object({ sessionId: z.string(), serverName: z.string(), enabled: z.boolean() }))
    .output(type<void>()),

  setMcpServers: oc
    .input(type<{ sessionId: string; servers: Record<string, McpServerConfig> }>())
    .output(type<McpSetServersResult>()),

  renameSession: oc
    .input(z.object({ sessionId: z.string(), title: z.string() }))
    .output(type<void>()),

  setModelSetting: oc
    .input(z.object({ sessionId: z.string(), model: z.string() }))
    .output(type<void>()),
};
