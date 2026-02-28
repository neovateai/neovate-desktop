import { ORPCError, implement } from "@orpc/server";
import { acpContract } from "../../../shared/features/acp/contract";
import type { AppContext } from "../../router";

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

function getUnknownErrorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; code?: unknown };
    if (typeof maybeError.message === "string" && maybeError.message.trim()) {
      return maybeError.message;
    }
    if (typeof maybeError.code === "string" && maybeError.code.trim()) {
      return `Agent prompt failed (${maybeError.code}).`;
    }
  }

  return undefined;
}

export const acpRouter = os.acp.router({
  listAgents: os.acp.listAgents.handler(({ context }) => {
    return context.acpAgentRegistry.getAll();
  }),

  connect: os.acp.connect.handler(async ({ input, context }) => {
    acpLog("connect: start", { agentId: input.agentId, cwd: input.cwd });
    const agent = context.acpAgentRegistry.get(input.agentId);
    if (!agent) throw new Error(`Unknown agent: ${input.agentId}`);

    try {
      const connection = await context.acpConnectionManager.connect(agent, input.cwd);
      acpLog("connect: success", { connectionId: connection.id, agentId: input.agentId });
      return { connectionId: connection.id };
    } catch (error) {
      const message =
        error instanceof Error
          ? `Failed to start agent "${agent.name}": ${error.message}`
          : `Failed to start agent "${agent.name}"`;
      acpLog("connect: failed", { agentId: input.agentId, error: message });
      throw new ORPCError("BAD_GATEWAY", { defined: true, message });
    }
  }),

  newSession: os.acp.newSession.handler(async ({ input, context }) => {
    acpLog("newSession: start", { connectionId: input.connectionId, cwd: input.cwd });
    const conn = context.acpConnectionManager.get(input.connectionId);
    if (!conn) throw new Error(`Unknown connection: ${input.connectionId}`);

    const result = await conn.sdk.newSession({
      cwd: input.cwd ?? process.cwd(),
      mcpServers: [],
    });

    const modes = result.modes?.availableModes?.map((m) => m.name);
    acpLog("newSession: success", {
      connectionId: input.connectionId,
      sessionId: result.sessionId,
      modes,
    });
    return { sessionId: result.sessionId, modes };
  }),

  prompt: os.acp.prompt.handler(async function* ({ input, signal, context }) {
    acpLog("prompt: start", {
      connectionId: input.connectionId,
      sessionId: input.sessionId,
      promptLength: input.prompt.length,
    });
    const conn = context.acpConnectionManager.get(input.connectionId);
    if (!conn) throw new Error(`Unknown connection: ${input.connectionId}`);

    // Use an internal AbortController to break the subscription when
    // the prompt resolves. Without this, the `for await` loop blocks
    // waiting for the next event even after the prompt is done.
    const done = new AbortController();
    if (signal) {
      signal.addEventListener("abort", () => done.abort(signal.reason), {
        once: true,
      });
    }

    let promptResult: Awaited<ReturnType<typeof conn.sdk.prompt>> | undefined;
    let promptError: unknown;
    let eventCount = 0;

    const promptPromise = conn.sdk
      .prompt({
        sessionId: input.sessionId,
        prompt: [{ type: "text", text: input.prompt }],
      })
      .then((result) => {
        promptResult = result;
        acpLog("prompt: sdk resolved", {
          connectionId: input.connectionId,
          sessionId: input.sessionId,
          stopReason: result.stopReason,
        });
        done.abort("prompt_done");
      })
      .catch((error: unknown) => {
        const stderrTail = context.acpConnectionManager.getStderr(input.connectionId).slice(-20);
        const message = getUnknownErrorMessage(error) ?? "Agent prompt failed.";
        promptError = new ORPCError("BAD_GATEWAY", {
          defined: true,
          message,
          data: {
            source: "acp_agent",
            message,
            stderrTail,
          },
          cause: error instanceof Error ? error : undefined,
        });
        acpLog("prompt: sdk rejected", {
          connectionId: input.connectionId,
          sessionId: input.sessionId,
          error: message,
          stderrTail,
        });
        done.abort("prompt_error");
      });

    const subscription = conn.subscribeSession(done.signal);

    try {
      for await (const event of subscription) {
        eventCount += 1;
        if (eventCount <= 10) {
          const sessionUpdate = event.type === "update" ? event.data.update.sessionUpdate : null;
          acpLog("prompt: event", {
            connectionId: input.connectionId,
            sessionId: input.sessionId,
            eventType: event.type,
            sessionUpdate,
            eventCount,
          });
        }
        yield event;
      }
    } catch (e: unknown) {
      // When we abort our internal `done` signal after prompt completion/failure,
      // different runtimes can throw either DOMException AbortError or custom values.
      if (!done.signal.aborted && !(e instanceof DOMException && e.name === "AbortError")) {
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
      stopReason: promptResult?.stopReason ?? "end_turn",
    });
    return { stopReason: promptResult?.stopReason ?? "end_turn" };
  }),

  resolvePermission: os.acp.resolvePermission.handler(({ input, context }) => {
    const conn = context.acpConnectionManager.get(input.connectionId);
    if (!conn) throw new Error(`Unknown connection: ${input.connectionId}`);

    conn.resolvePermission(input.requestId, input.optionId);
  }),

  cancel: os.acp.cancel.handler(async ({ input, context }) => {
    const conn = context.acpConnectionManager.get(input.connectionId);
    if (!conn) throw new Error(`Unknown connection: ${input.connectionId}`);

    await conn.sdk.cancel({ sessionId: input.sessionId });
  }),

  disconnect: os.acp.disconnect.handler(({ input, context }) => {
    context.acpConnectionManager.disconnect(input.connectionId);
  }),
});
