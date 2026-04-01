import type { Options } from "@anthropic-ai/claude-agent-sdk";
import type { AnyRouter } from "@orpc/server";

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
};
