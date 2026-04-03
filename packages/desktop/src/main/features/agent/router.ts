import { ORPCError, implement } from "@orpc/server";
import debug from "debug";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { AppContext } from "../../router";

import { agentContract } from "../../../shared/features/agent/contract";
import { APP_DATA_DIR } from "../../core/app-paths";
import { readModelSetting, writeModelSetting } from "./claude-settings";

const agentLog = debug("neovate:agent-router");

const os = implement({ agent: agentContract }).$context<AppContext>();

export const agentRouter = os.agent.router({
  activeSessions: os.agent.activeSessions.handler(({ context }) => {
    return context.sessionManager.getActiveSessions();
  }),

  listSessions: os.agent.listSessions.handler(async ({ input, context }) => {
    const sessions = await context.sessionManager.listSessions(input.cwd);
    const startTimes = context.projectStore.getSessionStartTimes();
    for (const s of sessions) {
      const override = startTimes[s.sessionId];
      if (override) s.createdAt = override;
    }
    return sessions;
  }),

  renameSession: os.agent.renameSession.handler(async ({ input, context }) => {
    agentLog("renameSession: sessionId=%s title=%s", input.sessionId, input.title);
    await context.sessionManager.renameSession(input.sessionId, input.title);
  }),

  updateSessionStartTime: os.agent.updateSessionStartTime.handler(({ input, context }) => {
    context.projectStore.setSessionStartTime(input.sessionId, input.createdAt);
  }),

  claudeCode: os.agent.claudeCode.router({
    createSession: os.agent.claudeCode.createSession.handler(async ({ input, context }) => {
      agentLog(
        "claudeCode.createSession: cwd=%s model=%s providerId=%s",
        input.cwd,
        input.model,
        input.providerId,
      );
      try {
        return await context.sessionManager.createSession(input.cwd, input.model, input.providerId);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to create session";
        throw new ORPCError("BAD_GATEWAY", { defined: true, message });
      }
    }),

    send: os.agent.claudeCode.send.handler(async ({ input, context }) => {
      await context.sessionManager.send(input.sessionId, input.message);
    }),

    subscribe: os.agent.claudeCode.subscribe.handler(async function* ({ input, context, signal }) {
      for await (const event of context.sessionManager.eventPublisher.subscribe(input.sessionId, {
        signal,
      })) {
        yield event;
      }
    }),

    closeSession: os.agent.claudeCode.closeSession.handler(async ({ input, context }) => {
      agentLog("claudeCode.closeSession: sessionId=%s", input.sessionId);
      await context.sessionManager.closeSession(input.sessionId);
    }),

    dispatch: os.agent.claudeCode.dispatch.handler(({ input, context }) => {
      return context.sessionManager.handleDispatch(input.sessionId, input.dispatch);
    }),

    loadSession: os.agent.claudeCode.loadSession.handler(async ({ input, context }) => {
      agentLog("claudeCode.loadSession: sessionId=%s cwd=%s", input.sessionId, input.cwd);
      try {
        return await context.sessionManager.loadSession(input.sessionId, input.cwd);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load session";
        agentLog("claudeCode.loadSession: FAILED error=%s", message);
        throw new ORPCError("BAD_GATEWAY", { defined: true, message });
      }
    }),
  }),

  network: os.agent.network.router({
    listRequests: os.agent.network.listRequests.handler(({ input, context }) => {
      return context.requestTracker.getRequests(input.sessionId);
    }),

    getRequestDetail: os.agent.network.getRequestDetail.handler(({ input, context }) => {
      return context.requestTracker.getRequestDetail(input.sessionId, input.requestId);
    }),

    getInspectorState: os.agent.network.getInspectorState.handler(({ input, context }) => {
      return context.requestTracker.getInspectorState(input.sessionId);
    }),

    clearRequests: os.agent.network.clearRequests.handler(({ input, context }) => {
      context.requestTracker.clearRequests(input.sessionId);
    }),

    subscribe: os.agent.network.subscribe.handler(async function* ({ input, context, signal }) {
      for await (const summary of context.requestTracker.eventPublisher.subscribe(input.sessionId, {
        signal,
      })) {
        yield summary;
      }
    }),
  }),

  rewindFilesDryRun: os.agent.rewindFilesDryRun.handler(async ({ input, context }) => {
    return context.sessionManager.rewindFilesDryRun(input.sessionId, input.messageId);
  }),

  rewindToMessage: os.agent.rewindToMessage.handler(async ({ input, context }) => {
    agentLog(
      "rewindToMessage: sessionId=%s messageId=%s restoreFiles=%s",
      input.sessionId,
      input.messageId,
      input.restoreFiles,
    );
    return context.sessionManager.rewindToMessage(
      input.sessionId,
      input.messageId,
      input.restoreFiles,
      input.title,
    );
  }),

  deleteSessionFile: os.agent.deleteSessionFile.handler(async ({ input, context }) => {
    agentLog("deleteSessionFile: sessionId=%s", input.sessionId);
    await context.sessionManager.deleteSessionFile(input.sessionId);
  }),

  archiveSessionFile: os.agent.archiveSessionFile.handler(async ({ input, context }) => {
    agentLog("archiveSessionFile: sessionId=%s", input.sessionId);
    await context.sessionManager.archiveSessionFile(input.sessionId, {
      forkedSessionId: input.forkedSessionId,
      rewindMessageId: input.rewindMessageId,
      restoreFiles: input.restoreFiles,
      title: input.title,
      cwd: input.cwd,
    });
  }),

  savePlan: os.agent.savePlan.handler(async ({ input }) => {
    const slug = input.title
      ? input.title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .slice(0, 50)
      : input.sessionId.slice(0, 8);
    const filename = `${new Date().toISOString().slice(0, 10)}-${slug}.md`;
    const dir = join(APP_DATA_DIR, "plans");
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, filename);
    await writeFile(filePath, input.plan, "utf8");
    agentLog("savePlan: saved to %s", filePath);
    return { path: filePath };
  }),

  setModelSetting: os.agent.setModelSetting.handler(({ input, context }) => {
    const { sessionId, model, scope } = input;
    const cwd = context.sessionManager.getSessionCwd(sessionId);
    agentLog(
      "setModelSetting: sessionId=%s model=%s scope=%s cwd=%s",
      sessionId,
      model,
      scope,
      cwd,
    );
    writeModelSetting(scope, model, { sessionId, cwd });
    // setModelSetting is only called for SDK Default — clear any provider at this scope
    if (scope === "project") {
      context.projectStore.setProjectSelection(cwd, null, null);
    } else if (scope === "global") {
      context.configStore.setGlobalSelection(null, null);
    }
    const effective = readModelSetting(sessionId, cwd);
    return { currentModel: effective?.model, modelScope: effective?.scope };
  }),
});
