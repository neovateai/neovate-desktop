import { randomUUID } from "node:crypto";
import { ORPCError, implement } from "@orpc/server";
import {
  AgentSpawnError,
  listBuiltInAgents,
  formatErrorMessage,
  listSessionsForAgent,
  writeSessionRecord,
  isoNow,
  SESSION_RECORD_SCHEMA,
  type SessionRecord,
} from "acpx";
import debug from "debug";
import { acpContract } from "../../../shared/features/acp/contract";
import type { StreamEvent } from "../../../shared/features/acp/types";
import { AGENT_OVERRIDES } from "./connection-manager";
import type { AppContext } from "../../router";
import type { AcpConnectionManager } from "./connection-manager";

/** "all" (default) | "latest" | "false" */
const PRELOAD_SESSION_MODE = process.env.NEOVATE_PRELOAD_SESSION ?? "all";

const os = implement({ acp: acpContract }).$context<AppContext>();
const acpLog = debug("neovate:acp-router");

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

function timingEntry(phase: string, label: string, durationMs: number): StreamEvent {
  return {
    type: "timing",
    entry: {
      phase,
      label,
      durationMs: Math.round(durationMs * 100) / 100,
      timestamp: Date.now(),
    },
  };
}

export const acpRouter = os.acp.router({
  listAgents: os.acp.listAgents.handler(() => {
    return listBuiltInAgents(AGENT_OVERRIDES).map((name) => ({ id: name, name }));
  }),

  connect: os.acp.connect.handler(async ({ input, context }) => {
    const t0 = performance.now();
    acpLog("connect: start", { agentId: input.agentId, cwd: input.cwd });

    try {
      const connection = await context.acpConnectionManager.connect(input.agentId, input.cwd);
      const elapsed = Math.round(performance.now() - t0);
      acpLog("connect: success in %dms", elapsed, {
        connectionId: connection.id,
        agentId: input.agentId,
      });
      return { connectionId: connection.id };
    } catch (error) {
      const message =
        error instanceof AgentSpawnError || error instanceof Error
          ? `Failed to start agent "${input.agentId}": ${error.message}`
          : `Failed to start agent "${input.agentId}"`;
      acpLog("connect: failed after %dms", Math.round(performance.now() - t0), {
        agentId: input.agentId,
        error: message,
      });
      throw new ORPCError("BAD_GATEWAY", { defined: true, message });
    }
  }),

  newSession: os.acp.newSession.handler(async ({ input, context }) => {
    const t0 = performance.now();
    acpLog("newSession: start", { connectionId: input.connectionId, cwd: input.cwd });
    const manager = context.acpConnectionManager;
    const conn = manager.getOrThrow(input.connectionId);

    const cwd = input.cwd ?? manager.getCwd(input.connectionId) ?? process.cwd();
    const result = await conn.client.createSession(cwd);

    const agentCommand = manager.getAgentCommand(input.connectionId) ?? "";
    const now = isoNow();
    const record: SessionRecord = {
      schema: SESSION_RECORD_SCHEMA,
      acpxRecordId: randomUUID(),
      acpSessionId: result.sessionId,
      agentSessionId: result.agentSessionId,
      agentCommand,
      cwd,
      createdAt: now,
      lastUsedAt: now,
      lastSeq: 0,
      eventLog: { active_path: "", segment_count: 0, max_segment_bytes: 0, max_segments: 0 },
      messages: [],
      updated_at: now,
      cumulative_token_usage: {},
      request_token_usage: {},
    };
    manager.setSessionRecord(input.connectionId, record);
    writeSessionRecord(record).catch(() => {});

    const commands = conn.getAvailableCommands(result.sessionId);
    const elapsed = Math.round(performance.now() - t0);
    acpLog("newSession: success in %dms", elapsed, {
      connectionId: input.connectionId,
      sessionId: result.sessionId,
      agentSessionId: result.agentSessionId,
      commands,
    });
    return {
      sessionId: result.sessionId,
      agentSessionId: result.agentSessionId,
      commands: commands.length > 0 ? commands : undefined,
    };
  }),

  listSessions: os.acp.listSessions.handler(async ({ input, context }) => {
    const t0 = performance.now();
    acpLog("listSessions: start", { connectionId: input.connectionId });
    context.acpConnectionManager.getOrThrow(input.connectionId);

    const agentCommand = context.acpConnectionManager.getAgentCommand(input.connectionId);
    if (!agentCommand) {
      throw new ORPCError("NOT_FOUND", {
        defined: true,
        message: `Unknown connection: ${input.connectionId}`,
      });
    }

    const records = await listSessionsForAgent(agentCommand);
    const sessions = records.map((r) => ({
      sessionId: r.acpSessionId,
      title: r.title ?? r.name,
      cwd: r.cwd,
      updatedAt: r.lastUsedAt,
      createdAt: r.createdAt,
    }));

    acpLog(
      "listSessions: success in %dms (count=%d)",
      Math.round(performance.now() - t0),
      sessions.length,
      {
        connectionId: input.connectionId,
      },
    );
    return sessions;
  }),

  preloadSessions: os.acp.preloadSessions.handler(async ({ input, context }) => {
    acpLog(
      "preloadSessions: received request connId=%s cwd=%s mode=%s inputCount=%d ids=%o",
      input.connectionId,
      input.cwd ?? "none",
      PRELOAD_SESSION_MODE,
      input.sessionIds.length,
      input.sessionIds.map((id) => id.slice(0, 8)),
    );

    if (PRELOAD_SESSION_MODE === "false") {
      acpLog("preloadSessions: disabled by NEOVATE_PRELOAD_SESSION=false");
      return;
    }

    // Filter out archived sessions before preloading
    const archivedMap = context.projectStore.getArchivedSessions();
    const archivedSet = new Set(
      input.cwd ? (archivedMap[input.cwd] ?? []) : Object.values(archivedMap).flat(),
    );
    const filtered = input.sessionIds.filter((id) => !archivedSet.has(id));
    const archivedCount = input.sessionIds.length - filtered.length;
    const ids = PRELOAD_SESSION_MODE === "latest" ? filtered.slice(0, 1) : filtered;

    acpLog(
      "preloadSessions: after filters archived=%d remaining=%d (mode=%s) final=%d ids=%o",
      archivedCount,
      filtered.length,
      PRELOAD_SESSION_MODE,
      ids.length,
      ids.map((id) => id.slice(0, 8)),
    );

    try {
      const conn = context.acpConnectionManager.getOrThrow(input.connectionId);
      // Preload sequentially to avoid flooding the agent
      for (let i = 0; i < ids.length; i++) {
        acpLog(
          "preloadSessions: [%d/%d] starting session %s",
          i + 1,
          ids.length,
          ids[i].slice(0, 8),
        );
        await conn.preloadSession(ids[i], input.cwd);
        acpLog(
          "preloadSessions: [%d/%d] finished session %s",
          i + 1,
          ids.length,
          ids[i].slice(0, 8),
        );
      }
      acpLog("preloadSessions: all done (%d sessions)", ids.length);
    } catch (error) {
      acpLog("preloadSessions: failed", {
        connectionId: input.connectionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }),

  loadSession: os.acp.loadSession.handler(async function* ({ input, signal, context }) {
    const t0 = performance.now();
    let firstEventAt: number | undefined;
    acpLog("loadSession: start", {
      connectionId: input.connectionId,
      sessionId: input.sessionId,
      cwd: input.cwd,
    });
    const conn = context.acpConnectionManager.getOrThrow(input.connectionId);

    // Check if this session was preloaded (waits for in-flight preload if any)
    const cached = await conn.consumePreload(input.sessionId);
    if (cached) {
      acpLog("loadSession: serving from preload cache (%d events)", cached.events.length);
      for (const event of cached.events) {
        yield event;
      }
      const totalMs = performance.now() - t0;
      yield timingEntry("loadSession", "time_to_first_event", 0);
      yield timingEntry("loadSession", "total", totalMs);
      return cached.result;
    }

    const done = new AbortController();
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          conn.client.cancel(input.sessionId).catch(() => {});
          done.abort(signal.reason);
        },
        { once: true },
      );
    }

    // Subscribe before loadSession so we capture replayed events
    const subscription = conn.subscribeSession(input.sessionId, done.signal);

    let loadResult: { agentSessionId?: string } | undefined;
    let loadError: unknown;
    let eventCount = 0;

    const loadPromise = conn.client
      .loadSession(input.sessionId, input.cwd)
      .then((result) => {
        loadResult = result;
        acpLog("loadSession: resolved", {
          connectionId: input.connectionId,
          sessionId: input.sessionId,
          agentSessionId: result.agentSessionId,
        });
        done.abort("load_done");
      })
      .catch((error: unknown) => {
        loadError = error;
        acpLog("loadSession: rejected", {
          connectionId: input.connectionId,
          sessionId: input.sessionId,
          error: formatErrorMessage(error),
        });
        done.abort("load_error");
      });

    try {
      for await (const event of subscription) {
        eventCount += 1;
        if (!firstEventAt) firstEventAt = performance.now();
        yield event;
      }
    } catch (e: unknown) {
      if (!done.signal.aborted) {
        throw e;
      }
    } finally {
      subscription.return(undefined);
    }

    await loadPromise;
    if (loadError) throw loadError;

    const totalMs = performance.now() - t0;
    const ttfe = firstEventAt ? firstEventAt - t0 : totalMs;
    acpLog(
      "loadSession: success in %dms (ttfe=%dms, events=%d)",
      Math.round(totalMs),
      Math.round(ttfe),
      eventCount,
      {
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        agentSessionId: loadResult?.agentSessionId,
      },
    );
    yield timingEntry("loadSession", "time_to_first_event", ttfe);
    yield timingEntry("loadSession", "total", totalMs);
    return { sessionId: input.sessionId, agentSessionId: loadResult?.agentSessionId };
  }),

  prompt: os.acp.prompt.handler(async function* ({ input, signal, context }) {
    const t0 = performance.now();
    let firstEventAt: number | undefined;
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

    const subscription = conn.subscribeSession(input.sessionId, done.signal);

    try {
      for await (const event of subscription) {
        eventCount += 1;
        if (!firstEventAt) firstEventAt = performance.now();
        if (eventCount <= 10 && acpLog.enabled) {
          acpLog("prompt: event", {
            connectionId: input.connectionId,
            sessionId: input.sessionId,
            eventType: event.type,
            eventCount,
            event: JSON.stringify(event),
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

    // Persist session record with updated timestamp
    const record = context.acpConnectionManager.getSessionRecord(
      input.connectionId,
      input.sessionId,
    );
    if (record) {
      if (!record.title) {
        record.title = input.prompt.slice(0, 50);
      }
      record.lastUsedAt = isoNow();
      record.lastPromptAt = record.lastUsedAt;
      writeSessionRecord(record).catch(() => {});
    }

    const totalMs = performance.now() - t0;
    const ttfe = firstEventAt ? firstEventAt - t0 : totalMs;
    acpLog(
      "prompt: done in %dms (ttfe=%dms, events=%d)",
      Math.round(totalMs),
      Math.round(ttfe),
      eventCount,
      {
        connectionId: input.connectionId,
        sessionId: input.sessionId,
        stopReason: stopReason ?? "end_turn",
      },
    );
    yield timingEntry("prompt", "time_to_first_event", ttfe);
    yield timingEntry("prompt", "total", totalMs);
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
