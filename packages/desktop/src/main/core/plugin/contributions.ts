import type { HookCallbackMatcher, HookEvent, Options } from "@anthropic-ai/claude-agent-sdk";
import type { AnyRouter } from "@orpc/server";

import type { DeeplinkHandler } from "../deeplink/types";
import type { Contribution } from "./contribution";

export interface AgentContributions {
  claudeCode?: ClaudeCodeContributions;
}

export interface ClaudeCodeContributions {
  options?: Pick<Options, "hooks">;
}

export type Contributions = {
  routers: Contribution<AnyRouter>[];
  agents: Contribution<AgentContributions>[];
  deeplinkHandlers: Contribution<DeeplinkHandler>[];
};

/** Merge agent hook contributions into a single SDK-compatible hooks record. */
export function mergeAgentHooks(
  agents: Contribution<AgentContributions>[],
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const merged: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
  for (const { value } of agents) {
    const hooks = value.claudeCode?.options?.hooks;
    if (!hooks) continue;
    for (const [event, matchers] of Object.entries(hooks)) {
      if (!matchers) continue;
      (merged[event as HookEvent] ??= []).push(...matchers);
    }
  }
  return merged;
}
