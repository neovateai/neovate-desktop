import { ORPCError, implement } from "@orpc/server";
import { AgentSpawnError, listBuiltInAgents, formatErrorMessage } from "acpx";
import { acpContract } from "../../../shared/features/acp/contract";
import { AGENT_OVERRIDES } from "./connection-manager";
import type { AppContext } from "../../router";
import type { AcpConnectionManager } from "./connection-manager";

const os = implement({ acp: acpContract }).$context<AppContext>();
const ACP_DEBUG = process.env.ACP_DEBUG === "1";

function acpLog(message: string, details?: Record<string, unknown>): void {
  if (!ACP_DEBUG) return;
  if (details) {
    console.log(`[acp-router] ${message}`, details);
    return;
  }
  console.log(`[acp-router] ${message}`);
}

function buildPromptError(
  error: unknown,
  manager: AcpConnectionManager,
  connectionId: string,
): ORPCError<"BAD_GATEWAY", unknown> {
  const stderrTail = manager.getStderr(connectionId).slice(-20);
  const lifecycle = manager.getClient(connectionId)?.getAgentLifecycleSnapshot();
  const lastExit = lifecycle?.lastExit;
  const message = formatErrorMessage(error);
  return new ORPCError("BAD_GATEWAY", {
    defined: true,
    message,
    data: {
      source: "acp_agent" as const,
      message,
      stderrTail,
      ...(lastExit
        ? {
            exitCode: lastExit.exitCode,
            signal: lastExit.signal,
            unexpectedDuringPrompt: lastExit.unexpectedDuringPrompt,
          }
        : {}),
    },
    cause: error instanceof Error ? error : undefined,
  });
}

export const acpRouter = os.acp.router({
  listAgents: os.acp.listAgents.handler(() => {
    return listBuiltInAgents(AGENT_OVERRIDES).map((name) => ({ id: name, name }));
  }),

  connect: os.acp.connect.handler(async ({ input, context }) => {
    acpLog("connect: start", { agentId: input.agentId, cwd: input.cwd });

    try {
      const connection = await context.acpConnectionManager.connect(input.agentId, input.cwd);
      acpLog("connect: success", { connectionId: connection.id, agentId: input.agentId });
      return { connectionId: connection.id };
    } catch (error) {
      const message =
        error instanceof AgentSpawnError || error instanceof Error
          ? `Failed to start agent "${input.agentId}": ${error.message}`
          : `Failed to start agent "${input.agentId}"`;
      acpLog("connect: failed", { agentId: input.agentId, error: message });
      throw new ORPCError("BAD_GATEWAY", { defined: true, message });
    }
  }),

  newSession: os.acp.newSession.handler(async ({ input, context }) => {
    acpLog("newSession: start", { connectionId: input.connectionId, cwd: input.cwd });
    const conn = context.acpConnectionManager.getOrThrow(input.connectionId);

    const result = await conn.client.createSession(input.cwd ?? process.cwd());

    acpLog("newSession: success", {
      connectionId: input.connectionId,
      sessionId: result.sessionId,
    });
    return { sessionId: result.sessionId };
  }),

  prompt: os.acp.prompt.handler(async function* ({ input, signal, context }) {
    acpLog("prompt: start", {
      connectionId: input.connectionId,
      sessionId: input.sessionId,
      promptLength: input.prompt.length,
    });
    const conn = context.acpConnectionManager.getOrThrow(input.connectionId);

    const done = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => done.abort(signal.reason), { once: true });
    }

    let stopReason: string | undefined;
    let promptError: unknown;
    let eventCount = 0;

    const promptPromise = conn.client
      .prompt(input.sessionId, input.prompt)
      .then((result) => {
        stopReason = result.stopReason;
        acpLog("prompt: resolved", {
          connectionId: input.connectionId,
          sessionId: input.sessionId,
          stopReason: result.stopReason,
        });
        done.abort("prompt_done");
      })
      .catch((error: unknown) => {
        promptError = buildPromptError(error, context.acpConnectionManager, input.connectionId);
        acpLog("prompt: rejected", {
          connectionId: input.connectionId,
          sessionId: input.sessionId,
          error: formatErrorMessage(error),
        });
        done.abort("prompt_error");
      });

    const subscription = conn.subscribeSession(done.signal);

    try {
      for await (const event of subscription) {
        eventCount += 1;
        if (eventCount <= 10) {
          acpLog("prompt: event", {
            connectionId: input.connectionId,
            sessionId: input.sessionId,
            eventType: event.type,
            eventCount,
          });
        }
        yield event;
      }
    } catch (e: unknown) {
      if (!done.signal.aborted) {
        throw e;
      }
    } finally {
      subscription.return(undefined);
    }

    await promptPromise;
    if (promptError) throw promptError;

    acpLog("prompt: done", {
      connectionId: input.connectionId,
      sessionId: input.sessionId,
      eventCount,
      stopReason: stopReason ?? "end_turn",
    });
    return { stopReason: stopReason ?? "end_turn" };
  }),

  resolvePermission: os.acp.resolvePermission.handler(({ input, context }) => {
    const conn = context.acpConnectionManager.getOrThrow(input.connectionId);
    conn.resolvePermission(input.requestId, input.optionId);
  }),

  cancel: os.acp.cancel.handler(async ({ input, context }) => {
    const conn = context.acpConnectionManager.getOrThrow(input.connectionId);
    try {
      await conn.client.cancel(input.sessionId);
    } catch (error) {
      acpLog("cancel: failed", {
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }),

  disconnect: os.acp.disconnect.handler(async ({ input, context }) => {
    try {
      await context.acpConnectionManager.disconnect(input.connectionId);
    } catch (error) {
      acpLog("disconnect: failed", {
        connectionId: input.connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }),
});
