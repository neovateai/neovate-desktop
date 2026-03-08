import { ORPCError, implement } from "@orpc/server";
import debug from "debug";
import { agentContract } from "../../../shared/features/agent/contract";
import type { StreamEvent } from "../../../shared/features/agent/types";
import type { AppContext } from "../../router";
import { writeModelToSettings } from "./claude-settings";

const agentLog = debug("neovate:agent-router");

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

const os = implement({ agent: agentContract }).$context<AppContext>();

export const agentRouter = os.agent.router({
  listSessions: os.agent.listSessions.handler(async ({ input, context }) => {
    agentLog("listSessions: cwd=%s", input.cwd);
    const result = await context.sessionManager.listSessions(input.cwd);
    agentLog("listSessions: returned %d sessions", result.length);
    return result;
  }),

  newSession: os.agent.newSession.handler(async ({ input, context }) => {
    const t0 = performance.now();
    agentLog("newSession: START cwd=%s model=%s", input.cwd, input.model);
    try {
      const result = await context.sessionManager.createSession(input.cwd, input.model);
      agentLog(
        "newSession: DONE in %dms sessionId=%s commands=%d",
        Math.round(performance.now() - t0),
        result.sessionId,
        result.commands?.length ?? 0,
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      agentLog(
        "newSession: FAILED after %dms error=%s stack=%s",
        Math.round(performance.now() - t0),
        message,
        error instanceof Error ? error.stack : "-",
      );
      throw new ORPCError("BAD_GATEWAY", { defined: true, message });
    }
  }),

  loadSession: os.agent.loadSession.handler(async function* ({ input, context }) {
    const t0 = performance.now();
    let firstEventAt: number | undefined;
    let eventCount = 0;
    let permissionEventCount = 0;
    agentLog("loadSession: START sessionId=%s cwd=%s", input.sessionId, input.cwd);

    const pendingPermissionEvents: StreamEvent[] = [];
    const emitter = (event: StreamEvent) => {
      agentLog("loadSession: permission emitter received event type=%s", event.type);
      pendingPermissionEvents.push(event);
    };

    try {
      for await (const event of context.sessionManager.loadSession(
        input.sessionId,
        input.cwd,
        emitter,
      )) {
        eventCount += 1;
        if (!firstEventAt) {
          firstEventAt = performance.now();
          agentLog(
            "loadSession: first event after %dms type=%s",
            Math.round(firstEventAt - t0),
            event.type,
          );
        }
        yield event;

        // Flush any permission events emitted by canUseTool callback
        while (pendingPermissionEvents.length > 0) {
          const permEvent = pendingPermissionEvents.shift()!;
          permissionEventCount++;
          agentLog(
            "loadSession: flushing permission event #%d type=%s",
            permissionEventCount,
            permEvent.type,
          );
          yield permEvent;
        }
      }
    } catch (error) {
      agentLog(
        "loadSession: FAILED sessionId=%s after %dms events=%d error=%s",
        input.sessionId,
        Math.round(performance.now() - t0),
        eventCount,
        error instanceof Error ? error.message : String(error),
      );
      throw error;
    }

    const totalMs = performance.now() - t0;
    const ttfe = firstEventAt ? firstEventAt - t0 : totalMs;
    agentLog(
      "loadSession: DONE in %dms (ttfe=%dms, events=%d, permEvents=%d)",
      Math.round(totalMs),
      Math.round(ttfe),
      eventCount,
      permissionEventCount,
    );
    yield timingEntry("loadSession", "time_to_first_event", ttfe);
    yield timingEntry("loadSession", "total", totalMs);
    return { sessionId: input.sessionId };
  }),

  prompt: os.agent.prompt.handler(async function* ({ input, context }) {
    const t0 = performance.now();
    let firstEventAt: number | undefined;
    let eventCount = 0;
    let permissionEventCount = 0;
    agentLog(
      "prompt: START sessionId=%s promptLen=%d prompt=%s attachments=%d attachmentDetails=%o",
      input.sessionId,
      input.prompt.length,
      input.prompt.slice(0, 100),
      input.attachments?.length ?? 0,
      input.attachments?.map((a) => ({
        id: a.id,
        filename: a.filename,
        mediaType: a.mediaType,
        base64Len: a.base64?.length ?? 0,
      })),
    );

    const pendingPermissionEvents: StreamEvent[] = [];
    const emitter = (event: StreamEvent) => {
      agentLog("prompt: permission emitter received event type=%s", event.type);
      pendingPermissionEvents.push(event);
    };

    try {
      for await (const event of context.sessionManager.prompt(
        input.sessionId,
        input.prompt,
        emitter,
        input.attachments,
      )) {
        eventCount += 1;
        if (!firstEventAt) {
          firstEventAt = performance.now();
          agentLog(
            "prompt: first event after %dms type=%s",
            Math.round(firstEventAt - t0),
            event.type,
          );
        }
        if (eventCount <= 10) {
          agentLog("prompt: yielding event #%d type=%s", eventCount, event.type);
        }
        yield event;

        // Flush any permission events emitted by canUseTool callback
        while (pendingPermissionEvents.length > 0) {
          const permEvent = pendingPermissionEvents.shift()!;
          permissionEventCount++;
          agentLog(
            "prompt: flushing permission event #%d type=%s",
            permissionEventCount,
            permEvent.type,
          );
          yield permEvent;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent prompt failed";
      agentLog(
        "prompt: FAILED sessionId=%s after %dms events=%d error=%s stack=%s",
        input.sessionId,
        Math.round(performance.now() - t0),
        eventCount,
        message,
        error instanceof Error ? error.stack : "-",
      );
      throw new ORPCError("BAD_GATEWAY", {
        defined: true,
        message,
        data: { source: "agent" as const, message },
      });
    }

    const totalMs = performance.now() - t0;
    const ttfe = firstEventAt ? firstEventAt - t0 : totalMs;
    agentLog(
      "prompt: DONE in %dms (ttfe=%dms, events=%d, permEvents=%d)",
      Math.round(totalMs),
      Math.round(ttfe),
      eventCount,
      permissionEventCount,
    );
    yield timingEntry("prompt", "time_to_first_event", ttfe);
    yield timingEntry("prompt", "total", totalMs);
    return { stopReason: "end_turn" };
  }),

  resolvePermission: os.agent.resolvePermission.handler(({ input, context }) => {
    agentLog("resolvePermission: requestId=%s allow=%s", input.requestId, input.allow);
    context.sessionManager.resolvePermission(input.requestId, input.allow);
  }),

  cancel: os.agent.cancel.handler(async ({ input, context }) => {
    agentLog("cancel: sessionId=%s", input.sessionId);
    await context.sessionManager.cancel(input.sessionId);
  }),

  setPermissionMode: os.agent.setPermissionMode.handler(async ({ input, context }) => {
    agentLog("setPermissionMode: sessionId=%s mode=%s", input.sessionId, input.mode);
    await context.sessionManager.setPermissionMode(input.sessionId, input.mode);
  }),

  setModel: os.agent.setModel.handler(async ({ input, context }) => {
    agentLog("setModel: sessionId=%s model=%s", input.sessionId, input.model);
    await context.sessionManager.setModel(input.sessionId, input.model);
  }),

  setMaxThinkingTokens: os.agent.setMaxThinkingTokens.handler(async ({ input, context }) => {
    agentLog(
      "setMaxThinkingTokens: sessionId=%s maxThinkingTokens=%s",
      input.sessionId,
      input.maxThinkingTokens,
    );
    await context.sessionManager.setMaxThinkingTokens(input.sessionId, input.maxThinkingTokens);
  }),

  stopTask: os.agent.stopTask.handler(async ({ input, context }) => {
    agentLog("stopTask: sessionId=%s taskId=%s", input.sessionId, input.taskId);
    await context.sessionManager.stopTask(input.sessionId, input.taskId);
  }),

  rewindFiles: os.agent.rewindFiles.handler(async ({ input, context }) => {
    agentLog(
      "rewindFiles: sessionId=%s userMessageId=%s dryRun=%s",
      input.sessionId,
      input.userMessageId,
      input.dryRun,
    );
    return context.sessionManager.rewindFiles(input.sessionId, input.userMessageId, {
      dryRun: input.dryRun,
    });
  }),

  mcpServerStatus: os.agent.mcpServerStatus.handler(async ({ input, context }) => {
    agentLog("mcpServerStatus: sessionId=%s", input.sessionId);
    return context.sessionManager.mcpServerStatus(input.sessionId);
  }),

  reconnectMcpServer: os.agent.reconnectMcpServer.handler(async ({ input, context }) => {
    agentLog("reconnectMcpServer: sessionId=%s serverName=%s", input.sessionId, input.serverName);
    await context.sessionManager.reconnectMcpServer(input.sessionId, input.serverName);
  }),

  toggleMcpServer: os.agent.toggleMcpServer.handler(async ({ input, context }) => {
    agentLog(
      "toggleMcpServer: sessionId=%s serverName=%s enabled=%s",
      input.sessionId,
      input.serverName,
      input.enabled,
    );
    await context.sessionManager.toggleMcpServer(input.sessionId, input.serverName, input.enabled);
  }),

  setMcpServers: os.agent.setMcpServers.handler(async ({ input, context }) => {
    agentLog(
      "setMcpServers: sessionId=%s serverCount=%d",
      input.sessionId,
      Object.keys(input.servers).length,
    );
    return context.sessionManager.setMcpServers(input.sessionId, input.servers);
  }),

  setModelSetting: os.agent.setModelSetting.handler(({ input }) => {
    agentLog("setModelSetting: sessionId=%s model=%s", input.sessionId, input.model);
    writeModelToSettings(input.sessionId, input.model);
  }),
});
