import type { Query } from "@anthropic-ai/claude-agent-sdk";

import { oc, type, eventIterator } from "@orpc/contract";
import { z } from "zod";

import type {
  ClaudeCodeUIMessage,
  ClaudeCodeUIMessageChunk,
  ClaudeCodeUIEvent,
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
} from "../../claude-code/types";
import type { ModelScope, SessionInfo } from "./types";

export const agentContract = {
  listSessions: oc.input(z.object({ cwd: z.string().optional() })).output(type<SessionInfo[]>()),

  renameSession: oc
    .input(z.object({ sessionId: z.string(), title: z.string() }))
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

    stream: oc
      .input(type<{ sessionId: string; message: ClaudeCodeUIMessage }>())
      .output(eventIterator(type<ClaudeCodeUIMessageChunk>())),

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
