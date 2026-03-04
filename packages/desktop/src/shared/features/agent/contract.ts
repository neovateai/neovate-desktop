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
};
