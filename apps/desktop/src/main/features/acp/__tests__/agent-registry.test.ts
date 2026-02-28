import { describe, it, expect } from "vitest";
import { AgentRegistry } from "../agent-registry";

describe("AgentRegistry", () => {
  it("returns builtin agents", () => {
    const registry = new AgentRegistry();
    const agents = registry.getAll();
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0].id).toBe("claude-code");
  });

  it("gets agent by id", () => {
    const registry = new AgentRegistry();
    const agent = registry.get("claude-code");
    expect(agent).toBeDefined();
    expect(agent!.command).toBe("npx");
  });

  it("returns undefined for unknown id", () => {
    const registry = new AgentRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });
});
