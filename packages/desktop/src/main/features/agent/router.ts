import { ORPCError, implement } from "@orpc/server";
import debug from "debug";

import type { AppContext } from "../../router";

import { agentContract } from "../../../shared/features/agent/contract";
import { readModelSetting, writeModelSetting } from "./claude-settings";

const agentLog = debug("neovate:agent-router");

const os = implement({ agent: agentContract }).$context<AppContext>();

export const agentRouter = os.agent.router({
  listSessions: os.agent.listSessions.handler(async ({ input, context }) => {
    agentLog("listSessions: cwd=%s", input.cwd);
    const result = await context.sessionManager.listSessions(input.cwd);
    agentLog("listSessions: returned %d sessions", result.length);
    return result;
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
      context.providerStore.setProjectSelection(cwd, null, null);
    } else if (scope === "global") {
      context.providerStore.setGlobalSelection(null, null);
    }
    const effective = readModelSetting(sessionId, cwd);
    return { currentModel: effective?.model, modelScope: effective?.scope };
  }),
});
