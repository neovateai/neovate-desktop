import { oc, type, eventIterator } from "@orpc/contract";
import { z } from "zod";
import type {
  SessionInfo,
  StreamEvent,
  LoadSessionResult,
  PromptResult,
  SlashCommandInfo,
  CachedSession,
} from "./types";
import type {
  ClaudeCodeUIMessage,
  ClaudeCodeUIMessageChunk,
  ClaudeCodeUIEvent,
  ClaudeCodeUIDispatch,
  ClaudeCodeUIDispatchResult,
} from "./chat-types";

const promptErrorDataSchema = type<{
  source: "agent";
  message: string;
}>();

export const agentContract = {
  listSessions: oc.input(z.object({ cwd: z.string().optional() })).output(type<SessionInfo[]>()),

  newSession: oc
    .input(z.object({ cwd: z.string(), model: z.string().optional() }))
    .output(type<{ sessionId: string; commands?: SlashCommandInfo[] }>()),

  loadSession: oc
    .input(
      z.object({
        sessionId: z.string(),
        cwd: z.string().optional(),
        skipReplay: z.boolean().optional(),
      }),
    )
    .output(eventIterator(type<StreamEvent>(), type<LoadSessionResult>())),

  getSessionCache: oc
    .input(z.object({ sessionId: z.string() }))
    .output(type<CachedSession | null>()),

  saveSessionCache: oc
    .input(type<{ sessionId: string; data: CachedSession }>())
    .output(type<void>()),

  prompt: oc
    .input(z.object({ sessionId: z.string(), prompt: z.string() }))
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

  // V2: message stream — UIMessage in, UIMessageChunk out
  stream: oc
    .input(type<{ sessionId: string; message: ClaudeCodeUIMessage }>())
    .output(eventIterator(type<ClaudeCodeUIMessageChunk>())),

  // V2: subscribe stream — events + interaction requests
  subscribe: oc
    .input(type<{ sessionId: string }>())
    .output(eventIterator(type<ClaudeCodeUIEvent>())),

  // V2: dispatch — respond / configure
  dispatch: oc
    .input(type<{ sessionId: string; dispatch: ClaudeCodeUIDispatch }>())
    .output(type<ClaudeCodeUIDispatchResult>()),
};
