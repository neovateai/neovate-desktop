import type { AgentInfo } from "../../../../../shared/features/acp/types";

type Props = {
  agents: AgentInfo[];
  selectedId: string | null;
  onSelect: (agentId: string) => void;
  disabled?: boolean;
};

export function AgentSelector({ agents, selectedId, onSelect, disabled }: Props) {
  return (
    <select
      className="h-8 rounded-lg border border-input bg-background px-3 text-sm"
      value={selectedId ?? ""}
      onChange={(e) => onSelect(e.target.value)}
      disabled={disabled}
    >
      <option value="" disabled>
        Select an agent...
      </option>
      {agents.map((agent) => (
        <option key={agent.id} value={agent.id}>
          {agent.name}
        </option>
      ))}
    </select>
  );
}
