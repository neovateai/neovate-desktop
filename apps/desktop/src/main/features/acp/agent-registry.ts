import type { AgentInfo } from "../../../shared/features/acp/types";

const BUILTIN_AGENTS: AgentInfo[] = [
  {
    id: "claude-code",
    name: "Claude Code",
    command: "npx",
    args: ["-y", "@zed-industries/claude-code-acp"],
  },
];

export class AgentRegistry {
  private agents: AgentInfo[] = BUILTIN_AGENTS;

  getAll(): AgentInfo[] {
    return this.agents;
  }

  get(id: string): AgentInfo | undefined {
    return this.agents.find((a) => a.id === id);
  }
}
