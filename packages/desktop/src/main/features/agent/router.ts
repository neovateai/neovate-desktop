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
    return context.sessionManager.listSessions(input.cwd);
  }),

  renameSession: os.agent.renameSession.handler(async ({ input, context }) => {
    agentLog("renameSession: sessionId=%s title=%s", input.sessionId, input.title);
    await context.sessionManager.renameSession(input.sessionId, input.title);
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

    stream: os.agent.claudeCode.stream.handler(async function* ({ input, context }) {
      for await (const chunk of context.sessionManager.stream(input.sessionId, input.message)) {
        yield chunk;
      }
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
