import { describe, it, expect } from "vitest";

import type { Contribution } from "../contribution";
import type { AgentContributions } from "../contributions";

import { mergeAgentContributions } from "../contributions";

function makeContribution(
  pluginName: string,
  value: AgentContributions,
): Contribution<AgentContributions> {
  return { plugin: { name: pluginName }, value };
}

const noopHook = async () => ({ continue: true as const });

describe("mergeAgentContributions", () => {
  it("returns empty hooks and mcpServers when no contributions", () => {
    const result = mergeAgentContributions([]);
    expect(result).toEqual({ hooks: {}, mcpServers: {} });
  });

  it("returns empty hooks and mcpServers when contributions have no claudeCode options", () => {
    const result = mergeAgentContributions([
      makeContribution("a", {}),
      makeContribution("b", { claudeCode: {} }),
      makeContribution("c", { claudeCode: { options: {} } }),
    ]);
    expect(result).toEqual({ hooks: {}, mcpServers: {} });
  });

  it("merges mcpServers from a single plugin", () => {
    const result = mergeAgentContributions([
      makeContribution("a", {
        claudeCode: {
          options: {
            mcpServers: {
              "a:db": { command: "node", args: ["db.js"] },
            },
          },
        },
      }),
    ]);
    expect(result.mcpServers).toEqual({
      "a:db": { command: "node", args: ["db.js"] },
    });
  });

  it("merges hooks from a single plugin", () => {
    const matcher = { matcher: "Bash", hooks: [noopHook] };
    const result = mergeAgentContributions([
      makeContribution("a", {
        claudeCode: { options: { hooks: { PreToolUse: [matcher] } } },
      }),
    ]);
    expect(result.hooks).toEqual({ PreToolUse: [matcher] });
  });

  it("merges both hooks and mcpServers", () => {
    const matcher = { matcher: "Bash", hooks: [noopHook] };
    const result = mergeAgentContributions([
      makeContribution("a", {
        claudeCode: {
          options: {
            hooks: { PreToolUse: [matcher] },
            mcpServers: { "a:srv": { command: "a" } },
          },
        },
      }),
    ]);
    expect(result.hooks).toEqual({ PreToolUse: [matcher] });
    expect(result.mcpServers).toEqual({ "a:srv": { command: "a" } });
  });

  it("merges mcpServers from multiple plugins without conflicts", () => {
    const result = mergeAgentContributions([
      makeContribution("a", {
        claudeCode: { options: { mcpServers: { "a:db": { command: "a" } } } },
      }),
      makeContribution("b", {
        claudeCode: { options: { mcpServers: { "b:api": { command: "b" } } } },
      }),
    ]);
    expect(result.mcpServers).toEqual({
      "a:db": { command: "a" },
      "b:api": { command: "b" },
    });
  });

  it("first-win on mcpServers name conflict", () => {
    const result = mergeAgentContributions([
      makeContribution("first", {
        claudeCode: { options: { mcpServers: { shared: { command: "first" } } } },
      }),
      makeContribution("second", {
        claudeCode: { options: { mcpServers: { shared: { command: "second" } } } },
      }),
    ]);
    expect(result.mcpServers).toEqual({
      shared: { command: "first" },
    });
  });

  it("respects enforce ordering for mcpServers conflicts", () => {
    // Contributions are passed in enforce order (pre → normal → post)
    // so the first contribution in the array should win
    const result = mergeAgentContributions([
      makeContribution("pre-plugin", {
        claudeCode: { options: { mcpServers: { db: { command: "pre" } } } },
      }),
      makeContribution("normal-plugin", {
        claudeCode: { options: { mcpServers: { db: { command: "normal" } } } },
      }),
    ]);
    expect(result.mcpServers).toEqual({
      db: { command: "pre" },
    });
  });

  it("concatenates hooks from multiple plugins", () => {
    const matcherA = { matcher: "Bash", hooks: [noopHook] };
    const matcherB = { matcher: "Read", hooks: [noopHook] };
    const result = mergeAgentContributions([
      makeContribution("a", {
        claudeCode: { options: { hooks: { PreToolUse: [matcherA] } } },
      }),
      makeContribution("b", {
        claudeCode: { options: { hooks: { PreToolUse: [matcherB] } } },
      }),
    ]);
    expect(result.hooks).toEqual({
      PreToolUse: [matcherA, matcherB],
    });
  });

  it("returns empty mcpServers when plugins contribute empty mcpServers", () => {
    const result = mergeAgentContributions([
      makeContribution("a", {
        claudeCode: { options: { mcpServers: {} } },
      }),
    ]);
    expect(result.mcpServers).toEqual({});
  });

  it("gracefully handles undefined at every nesting level", () => {
    const result = mergeAgentContributions([
      makeContribution("a", {}),
      makeContribution("b", { claudeCode: undefined }),
      makeContribution("c", { claudeCode: { options: undefined } }),
      makeContribution("d", {
        claudeCode: { options: { hooks: undefined, mcpServers: undefined } },
      }),
    ]);
    expect(result).toEqual({ hooks: {}, mcpServers: {} });
  });
});
