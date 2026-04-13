import type {
  HookCallbackMatcher,
  HookEvent,
  McpServerConfig,
  Options,
} from "@anthropic-ai/claude-agent-sdk";
import type { AnyRouter } from "@orpc/server";

import debug from "debug";

import type { DeeplinkHandler } from "../deeplink/types";
import type { Contribution } from "./contribution";

const log = debug("neovate:plugin:contributions");

export interface AgentContributions {
  claudeCode?: ClaudeCodeContributions;
}

export interface ClaudeCodeContributions {
  options?: Pick<Options, "hooks" | "mcpServers">;
}

export type Contributions = {
  routers: Contribution<AnyRouter>[];
  agents: Contribution<AgentContributions>[];
  deeplinkHandlers: Contribution<DeeplinkHandler>[];
};

type MergedAgentOptions = Pick<Options, "hooks" | "mcpServers">;

/** Merge all agent contributions into a single SDK-compatible options subset. */
export function mergeAgentContributions(
  agents: Contribution<AgentContributions>[],
): MergedAgentOptions {
  const hooks: Partial<Record<HookEvent, HookCallbackMatcher[]>> = {};
  const mcpServers: Record<string, McpServerConfig> = {};
  const mcpServerSources: Record<string, string> = {};

  for (const { plugin, value } of agents) {
    const pluginHooks = value.claudeCode?.options?.hooks;
    if (pluginHooks) {
      for (const [event, matchers] of Object.entries(pluginHooks)) {
        if (!matchers) continue;
        (hooks[event as HookEvent] ??= []).push(...matchers);
      }
    }

    const pluginMcpServers = value.claudeCode?.options?.mcpServers;
    if (pluginMcpServers) {
      for (const [name, config] of Object.entries(pluginMcpServers)) {
        if (mcpServerSources[name]) {
          log(
            "MCP server '%s' from plugin '%s' ignored — already registered by '%s'",
            name,
            plugin.name,
            mcpServerSources[name],
          );
          continue;
        }
        mcpServers[name] = config;
        mcpServerSources[name] = plugin.name;
      }
    }
  }

  return { hooks, mcpServers };
}
