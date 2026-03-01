import { oc, type, eventIterator } from "@orpc/contract";
import { z } from "zod";
import type { AgentInfo, StreamEvent, PromptResult } from "./types";

const promptErrorDataSchema = type<{
  source: "acp_agent";
  message: string;
  stderrTail: string[];
  exitCode?: number | null;
  signal?: string | null;
  unexpectedDuringPrompt?: boolean;
}>();

const connectionNotFoundError = {
  NOT_FOUND: { message: "Unknown connection" },
};

export const acpContract = {
  listAgents: oc.output(type<AgentInfo[]>()),

  connect: oc
    .input(z.object({ agentId: z.string(), cwd: z.string().optional() }))
    .output(type<{ connectionId: string }>()),

  newSession: oc
    .input(z.object({ connectionId: z.string(), cwd: z.string().optional() }))
    .errors(connectionNotFoundError)
    .output(type<{ sessionId: string; agentSessionId?: string; modes?: string[] }>()),

  loadSession: oc
    .input(
      z.object({
        connectionId: z.string(),
        sessionId: z.string(),
        cwd: z.string().optional(),
      }),
    )
    .errors(connectionNotFoundError)
    .output(type<{ sessionId: string; agentSessionId?: string }>()),

  prompt: oc
    .input(
      z.object({
        connectionId: z.string(),
        sessionId: z.string(),
        prompt: z.string(),
      }),
    )
    .errors({
      ...connectionNotFoundError,
      BAD_GATEWAY: {
        message: "Agent prompt failed",
        data: promptErrorDataSchema,
      },
    })
    .output(eventIterator(type<StreamEvent>(), type<PromptResult>())),

  resolvePermission: oc
    .input(
      z.object({
        connectionId: z.string(),
        requestId: z.string(),
        optionId: z.string(),
      }),
    )
    .errors(connectionNotFoundError)
    .output(type<void>()),

  cancel: oc
    .input(z.object({ connectionId: z.string(), sessionId: z.string() }))
    .errors(connectionNotFoundError)
    .output(type<void>()),

  disconnect: oc
    .input(z.object({ connectionId: z.string() }))
    .errors(connectionNotFoundError)
    .output(type<void>()),
};
