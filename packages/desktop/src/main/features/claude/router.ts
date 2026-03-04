import { ORPCError, implement } from "@orpc/server";
import debug from "debug";
import { claudeContract } from "../../../shared/features/claude/contract";
import type { StreamEvent } from "../../../shared/features/claude/types";
import type { AppContext } from "../../router";

const claudeLog = debug("neovate:claude-router");

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

const os = implement({ claude: claudeContract }).$context<AppContext>();

export const claudeRouter = os.claude.router({
  listSessions: os.claude.listSessions.handler(async ({ input, context }) => {
    claudeLog("listSessions: cwd=%s", input.cwd);
    const result = await context.sessionManager.listSessions(input.cwd);
    claudeLog("listSessions: returned %d sessions", result.length);
    return result;
  }),

  newSession: os.claude.newSession.handler(async ({ input, context }) => {
    const t0 = performance.now();
    claudeLog("newSession: START cwd=%s model=%s", input.cwd, input.model);
    try {
      const result = await context.sessionManager.createSession(input.cwd, input.model);
      claudeLog(
        "newSession: DONE in %dms sessionId=%s commands=%d",
        Math.round(performance.now() - t0),
        result.sessionId,
        result.commands?.length ?? 0,
      );
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create session";
      claudeLog(
        "newSession: FAILED after %dms error=%s stack=%s",
        Math.round(performance.now() - t0),
        message,
        error instanceof Error ? error.stack : "-",
      );
      throw new ORPCError("BAD_GATEWAY", { defined: true, message });
    }
  }),

  loadSession: os.claude.loadSession.handler(async function* ({ input, context }) {
    const t0 = performance.now();
    let firstEventAt: number | undefined;
    let eventCount = 0;
    let permissionEventCount = 0;
    claudeLog("loadSession: START sessionId=%s cwd=%s", input.sessionId, input.cwd);

    const pendingPermissionEvents: StreamEvent[] = [];
    const emitter = (event: StreamEvent) => {
      claudeLog("loadSession: permission emitter received event type=%s", event.type);
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
          claudeLog(
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
          claudeLog(
            "loadSession: flushing permission event #%d type=%s",
            permissionEventCount,
            permEvent.type,
          );
          yield permEvent;
        }
      }
    } catch (error) {
      claudeLog(
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
    claudeLog(
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

  prompt: os.claude.prompt.handler(async function* ({ input, context }) {
    const t0 = performance.now();
    let firstEventAt: number | undefined;
    let eventCount = 0;
    let permissionEventCount = 0;
    claudeLog(
      "prompt: START sessionId=%s promptLen=%d prompt=%s",
      input.sessionId,
      input.prompt.length,
      input.prompt.slice(0, 100),
    );

    const pendingPermissionEvents: StreamEvent[] = [];
    const emitter = (event: StreamEvent) => {
      claudeLog("prompt: permission emitter received event type=%s", event.type);
      pendingPermissionEvents.push(event);
    };

    try {
      for await (const event of context.sessionManager.prompt(
        input.sessionId,
        input.prompt,
        emitter,
      )) {
        eventCount += 1;
        if (!firstEventAt) {
          firstEventAt = performance.now();
          claudeLog(
            "prompt: first event after %dms type=%s",
            Math.round(firstEventAt - t0),
            event.type,
          );
        }
        if (eventCount <= 10) {
          claudeLog("prompt: yielding event #%d type=%s", eventCount, event.type);
        }
        yield event;

        // Flush any permission events emitted by canUseTool callback
        while (pendingPermissionEvents.length > 0) {
          const permEvent = pendingPermissionEvents.shift()!;
          permissionEventCount++;
          claudeLog(
            "prompt: flushing permission event #%d type=%s",
            permissionEventCount,
            permEvent.type,
          );
          yield permEvent;
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent prompt failed";
      claudeLog(
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
        data: { source: "claude_agent" as const, message },
      });
    }

    const totalMs = performance.now() - t0;
    const ttfe = firstEventAt ? firstEventAt - t0 : totalMs;
    claudeLog(
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

  resolvePermission: os.claude.resolvePermission.handler(({ input, context }) => {
    claudeLog("resolvePermission: requestId=%s allow=%s", input.requestId, input.allow);
    context.sessionManager.resolvePermission(input.requestId, input.allow);
  }),

  cancel: os.claude.cancel.handler(async ({ input, context }) => {
    claudeLog("cancel: sessionId=%s", input.sessionId);
    await context.sessionManager.cancel(input.sessionId);
  }),
});
