import type { Query } from "@anthropic-ai/claude-agent-sdk";

import { oc, type, eventIterator } from "@orpc/contract";
import { z } from "zod";

import type {
  ClaudeCodeUIMessage,
  ClaudeCodeUIEvent,
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
} from "../../claude-code/types";
import type { InspectorState, RequestDetail, RequestSummary } from "./request-types";
import type {
  ActiveSessionInfo,
  ModelScope,
  RewindFilesResult,
  RewindResult,
  SessionInfo,
} from "./types";

export const agentContract = {
  activeSessions: oc.input(z.object({})).output(type<ActiveSessionInfo[]>()),

  listSessions: oc.input(z.object({ cwd: z.string().optional() })).output(type<SessionInfo[]>()),

  renameSession: oc
    .input(z.object({ sessionId: z.string(), title: z.string() }))
    .output(type<void>()),

  updateSessionStartTime: oc
    .input(z.object({ sessionId: z.string(), createdAt: z.string() }))
    .output(type<void>()),

  claudeCode: {
    createSession: oc
      .input(
        z.object({
          cwd: z.string(),
          model: z.string().optional(),
          providerId: z.string().nullable().optional(),
        }),
      )
      .output(
        type<
          {
            sessionId: string;
            currentModel?: string;
            modelScope?: ModelScope;
            providerId?: string;
          } & Awaited<ReturnType<Query["initializationResult"]>>
        >(),
      ),

    send: oc
      .input(type<{ sessionId: string; message: ClaudeCodeUIMessage }>())
      .output(type<void>()),

    subscribe: oc
      .input(type<{ sessionId: string }>())
      .output(eventIterator(type<ClaudeCodeUIEvent>())),

    dispatch: oc
      .input(type<{ sessionId: string; dispatch: ClaudeCodeUIDispatch }>())
      .output(type<ClaudeCodeUIDispatchResult>()),

    closeSession: oc.input(z.object({ sessionId: z.string() })).output(type<void>()),

    loadSession: oc.input(z.object({ sessionId: z.string(), cwd: z.string() })).output(
      type<{
        sessionId: string;
        capabilities: Awaited<ReturnType<Query["initializationResult"]>>;
        messages: ClaudeCodeUIMessage[];
        currentModel?: string;
        modelScope?: ModelScope;
        providerId?: string;
      }>(),
    ),
  },

  network: {
    listRequests: oc.input(z.object({ sessionId: z.string() })).output(type<RequestSummary[]>()),

    getRequestDetail: oc
      .input(z.object({ sessionId: z.string(), requestId: z.string() }))
      .output(type<RequestDetail | null>()),

    getInspectorState: oc.input(z.object({ sessionId: z.string() })).output(type<InspectorState>()),

    clearRequests: oc.input(z.object({ sessionId: z.string() })).output(type<void>()),

    subscribe: oc
      .input(type<{ sessionId: string }>())
      .output(eventIterator(type<RequestSummary>())),
  },

  rewindFilesDryRun: oc
    .input(z.object({ sessionId: z.string(), messageId: z.string() }))
    .output(type<RewindFilesResult>()),

  rewindToMessage: oc
    .input(
      z.object({
        sessionId: z.string(),
        messageId: z.string(),
        restoreFiles: z.boolean(),
        title: z.string().optional(),
      }),
    )
    .output(type<RewindResult>()),

  deleteSessionFile: oc.input(z.object({ sessionId: z.string() })).output(type<void>()),

  archiveSessionFile: oc
    .input(
      z.object({
        sessionId: z.string(),
        forkedSessionId: z.string(),
        rewindMessageId: z.string(),
        restoreFiles: z.boolean(),
        title: z.string().optional(),
        cwd: z.string().optional(),
      }),
    )
    .output(type<void>()),

  savePlan: oc
    .input(
      z.object({
        sessionId: z.string(),
        plan: z.string(),
        title: z.string().optional(),
      }),
    )
    .output(type<{ path: string }>()),

  setModelSetting: oc
    .input(
      z.object({
        sessionId: z.string(),
        model: z.string().nullable(),
        scope: z.enum(["session", "project", "global"]),
      }),
    )
    .output(type<{ currentModel?: string; modelScope?: ModelScope }>()),
};
