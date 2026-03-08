#!/usr/bin/env bun

import { resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage, SDKMessage, Query } from "@anthropic-ai/claude-agent-sdk";

// The SDK refuses to run inside a Claude Code session (detects CLAUDECODE env var).
// Clear it so this script works when invoked from within Claude Code.
delete process.env.CLAUDECODE;

// ---------------------------------------------------------------------------
// Pushable — async iterable you can push values into
// ---------------------------------------------------------------------------

class Pushable<T> implements AsyncIterable<T> {
  private resolvers: ((value: IteratorResult<T>) => void)[] = [];
  private buffer: T[] = [];
  private done = false;

  push(value: T): void {
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver({ value, done: false });
    } else {
      this.buffer.push(value);
    }
  }

  end(): void {
    this.done = true;
    for (const r of this.resolvers) {
      r({ value: undefined as T, done: true });
    }
    this.resolvers.length = 0;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        const buffered = this.buffer.shift();
        if (buffered !== undefined) return Promise.resolve({ value: buffered, done: false });
        if (this.done) return Promise.resolve({ value: undefined as T, done: true });
        return new Promise((resolve) => this.resolvers.push(resolve));
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

interface ParsedArgs {
  help: boolean;
  json: boolean;
  cwd: string;
  model: string;
  subcommand: string;
  rest: string[];
}

function parseArgs(): ParsedArgs {
  const argv = Bun.argv.slice(2);
  const result: ParsedArgs = {
    help: false,
    json: false,
    cwd: process.cwd(),
    model: "sonnet",
    subcommand: "",
    rest: [],
  };

  let i = 0;
  // consume flags before subcommand
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--cwd" && i + 1 < argv.length) {
      result.cwd = argv[++i];
    } else if (arg === "--model" && i + 1 < argv.length) {
      result.model = argv[++i];
    } else if (!arg.startsWith("-")) {
      result.subcommand = arg;
      i++;
      break;
    }
  }
  // remaining args are subcommand-specific
  for (; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      result.json = true;
    } else if (arg === "--cwd" && i + 1 < argv.length) {
      result.cwd = argv[++i];
    } else if (arg === "--model" && i + 1 < argv.length) {
      result.model = argv[++i];
    } else {
      result.rest.push(arg);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function showHelp(): void {
  console.log(`
Usage: bun packages/desktop/scripts/test-sdk.ts [options] <subcommand> [args...]

Test the @anthropic-ai/claude-agent-sdk Query interface.

Options:
  --cwd <path>      Working directory (default: cwd)
  --model <model>   Model to use (default: sonnet)
  --json            Output as JSON
  -h, --help        Show this help

Subcommands (read-only):
  init              Full initialization result (commands, agents, models, account, etc.)
  commands          List slash commands
  models            List available models
  agents            List available agents
  account           Show account info
  mcp-status        Show MCP server status

Subcommands (mutations):
  set-model <model>               Change model for the session
  set-permission <mode>            Change permission mode (default|acceptEdits|bypassPermissions|plan|dontAsk)
  set-thinking <n|null>            Set max thinking tokens (deprecated)
  prompt <text>                    Send a prompt and stream response
  mcp-reconnect <name>            Reconnect an MCP server
  mcp-toggle <name> <on|off>      Toggle an MCP server
  stop-task <taskId>               Stop a running task
  rewind <messageId> [--dry-run]   Rewind files to a user message

Examples:
  bun packages/desktop/scripts/test-sdk.ts init
  bun packages/desktop/scripts/test-sdk.ts commands --json
  bun packages/desktop/scripts/test-sdk.ts models --cwd /path/to/project
  bun packages/desktop/scripts/test-sdk.ts prompt "What files are in this directory?"
  bun packages/desktop/scripts/test-sdk.ts set-model haiku
  bun packages/desktop/scripts/test-sdk.ts mcp-status
`);
}

// ---------------------------------------------------------------------------
// Output helpers
// ---------------------------------------------------------------------------

function out(args: ParsedArgs, data: unknown, humanFn: () => void): void {
  if (args.json) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    humanFn();
  }
}

// ---------------------------------------------------------------------------
// Session setup
// ---------------------------------------------------------------------------

async function createQuery(
  args: ParsedArgs,
): Promise<{ q: Query; input: Pushable<SDKUserMessage> }> {
  const cwd = resolve(args.cwd);
  const input = new Pushable<SDKUserMessage>();

  const q = query({
    prompt: input,
    options: {
      model: args.model,
      cwd,
      permissionMode: "default",
      settingSources: ["user", "project", "local"],
    },
  });

  await q.initializationResult();
  return { q, input };
}

// ---------------------------------------------------------------------------
// Subcommand handlers
// ---------------------------------------------------------------------------

async function cmdInit(args: ParsedArgs): Promise<void> {
  const cwd = resolve(args.cwd);
  const input = new Pushable<SDKUserMessage>();
  const q = query({
    prompt: input,
    options: {
      model: args.model,
      cwd,
      permissionMode: "default",
      settingSources: ["user", "project", "local"],
    },
  });

  const result = await q.initializationResult();
  out(args, result, () => {
    console.log("Initialization result:");
    console.log(`  Output style: ${result.output_style}`);
    console.log(`  Available output styles: ${result.available_output_styles.join(", ")}`);
    console.log(`  Fast mode: ${result.fast_mode_state ?? "n/a"}`);
    console.log(
      `  Account: ${result.account.email ?? "n/a"} (${result.account.subscriptionType ?? "unknown"})`,
    );
    console.log(`  Commands: ${result.commands.length}`);
    console.log(`  Models: ${result.models.length}`);
    console.log(`  Agents: ${result.agents.length}`);
  });
  process.exit(0);
}

async function cmdCommands(args: ParsedArgs): Promise<void> {
  const { q } = await createQuery(args);
  const commands = await q.supportedCommands();
  out(args, commands, () => {
    if (commands.length === 0) {
      console.log("No slash commands available.");
    } else {
      console.log(`Slash commands (${commands.length}):`);
      for (const cmd of commands) {
        const hint = cmd.argumentHint ? ` ${cmd.argumentHint}` : "";
        const desc = cmd.description ? ` — ${cmd.description}` : "";
        console.log(`  /${cmd.name}${hint}${desc}`);
      }
    }
  });
  process.exit(0);
}

async function cmdModels(args: ParsedArgs): Promise<void> {
  const { q } = await createQuery(args);
  const models = await q.supportedModels();
  out(args, models, () => {
    if (models.length === 0) {
      console.log("No models available.");
    } else {
      console.log(`Models (${models.length}):`);
      for (const m of models) {
        const effort = m.supportsEffort ? ` [effort: ${m.supportedEffortLevels?.join(",")}]` : "";
        console.log(`  ${m.value} — ${m.displayName}${effort}`);
        console.log(`    ${m.description}`);
      }
    }
  });
  process.exit(0);
}

async function cmdAgents(args: ParsedArgs): Promise<void> {
  const { q } = await createQuery(args);
  const agents = await q.supportedAgents();
  out(args, agents, () => {
    if (agents.length === 0) {
      console.log("No agents available.");
    } else {
      console.log(`Agents (${agents.length}):`);
      for (const a of agents) {
        const model = a.model ? ` [model: ${a.model}]` : "";
        console.log(`  ${a.name}${model}`);
        console.log(`    ${a.description}`);
      }
    }
  });
  process.exit(0);
}

async function cmdAccount(args: ParsedArgs): Promise<void> {
  const { q } = await createQuery(args);
  const account = await q.accountInfo();
  out(args, account, () => {
    console.log("Account info:");
    console.log(`  Email: ${account.email ?? "n/a"}`);
    console.log(`  Organization: ${account.organization ?? "n/a"}`);
    console.log(`  Subscription: ${account.subscriptionType ?? "n/a"}`);
    console.log(`  Token source: ${account.tokenSource ?? "n/a"}`);
    console.log(`  API key source: ${account.apiKeySource ?? "n/a"}`);
  });
  process.exit(0);
}

async function cmdMcpStatus(args: ParsedArgs): Promise<void> {
  const { q } = await createQuery(args);
  const statuses = await q.mcpServerStatus();
  out(args, statuses, () => {
    if (statuses.length === 0) {
      console.log("No MCP servers configured.");
    } else {
      console.log(`MCP servers (${statuses.length}):`);
      for (const s of statuses) {
        const info = s.serverInfo ? ` (${s.serverInfo.name} v${s.serverInfo.version})` : "";
        const err = s.error ? ` error: ${s.error}` : "";
        const scope = s.scope ? ` [${s.scope}]` : "";
        console.log(`  ${s.name}: ${s.status}${info}${scope}${err}`);
        if (s.tools && s.tools.length > 0) {
          for (const t of s.tools) {
            console.log(`    - ${t.name}${t.description ? `: ${t.description}` : ""}`);
          }
        }
      }
    }
  });
  process.exit(0);
}

async function cmdSetModel(args: ParsedArgs): Promise<void> {
  const model = args.rest[0];
  if (!model) {
    console.error("Usage: test-sdk.ts set-model <model>");
    process.exit(1);
  }
  const { q } = await createQuery(args);
  await q.setModel(model);
  console.log(`Model set to: ${model}`);
  process.exit(0);
}

async function cmdSetPermission(args: ParsedArgs): Promise<void> {
  const mode = args.rest[0];
  if (!mode) {
    console.error("Usage: test-sdk.ts set-permission <mode>");
    console.error("Modes: default, acceptEdits, bypassPermissions, plan, dontAsk");
    process.exit(1);
  }
  const { q } = await createQuery(args);
  await q.setPermissionMode(mode as any);
  console.log(`Permission mode set to: ${mode}`);
  process.exit(0);
}

async function cmdSetThinking(args: ParsedArgs): Promise<void> {
  const val = args.rest[0];
  if (val === undefined) {
    console.error("Usage: test-sdk.ts set-thinking <n|null>");
    process.exit(1);
  }
  const { q } = await createQuery(args);
  const n = val === "null" ? null : parseInt(val, 10);
  if (n !== null && isNaN(n)) {
    console.error("Invalid value: must be a number or 'null'");
    process.exit(1);
  }
  await q.setMaxThinkingTokens(n);
  console.log(`Max thinking tokens set to: ${n}`);
  process.exit(0);
}

async function cmdPrompt(args: ParsedArgs): Promise<void> {
  const text = args.rest.join(" ");
  if (!text) {
    console.error("Usage: test-sdk.ts prompt <text>");
    process.exit(1);
  }

  const cwd = resolve(args.cwd);
  const input = new Pushable<SDKUserMessage>();
  const sessionId = crypto.randomUUID();

  const q = query({
    prompt: input,
    options: {
      model: args.model,
      cwd,
      permissionMode: "bypassPermissions",
      settingSources: ["user", "project", "local"],
    },
  });

  await q.initializationResult();

  input.push({
    type: "user",
    message: { role: "user", content: text },
    parent_tool_use_id: null,
    session_id: sessionId,
  });

  const events: SDKMessage[] = [];

  for await (const msg of q) {
    if (args.json) {
      events.push(msg);
    } else {
      printMessage(msg);
    }
    if (msg.type === "result") break;
  }

  if (args.json) {
    console.log(JSON.stringify(events, null, 2));
  }

  process.exit(0);
}

function printMessage(msg: SDKMessage): void {
  switch (msg.type) {
    case "stream_event": {
      const event = msg.event;
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if ("text" in delta && typeof delta.text === "string") {
          process.stdout.write(delta.text);
        }
        if ("thinking" in delta && typeof delta.thinking === "string") {
          process.stdout.write(`\x1b[2m${delta.thinking}\x1b[0m`);
        }
      }
      break;
    }
    case "assistant": {
      for (const block of msg.message.content) {
        if (block.type === "text") process.stdout.write(block.text);
        if (block.type === "tool_use") {
          console.log(`\n\x1b[33m[tool_use] ${block.name} (${block.id})\x1b[0m`);
          console.log(JSON.stringify(block.input, null, 2));
        }
      }
      break;
    }
    case "tool_progress":
      console.log(
        `\x1b[36m[tool_progress] ${msg.tool_name} (${msg.tool_use_id}) ${msg.elapsed_time_seconds}s\x1b[0m`,
      );
      break;
    case "tool_use_summary":
      console.log(`\x1b[36m[tool_summary] ${msg.summary}\x1b[0m`);
      break;
    case "result":
      console.log(); // newline after streaming text
      console.log(
        `\x1b[32m[result] stop=${msg.stop_reason} turns=${msg.num_turns} cost=$${msg.total_cost_usd?.toFixed(4)} duration=${msg.duration_ms}ms\x1b[0m`,
      );
      if (msg.usage) {
        console.log(
          `\x1b[32m  input_tokens=${msg.usage.input_tokens} output_tokens=${msg.usage.output_tokens}\x1b[0m`,
        );
      }
      break;
    case "system":
      if ("subtype" in msg) {
        console.log(`\x1b[90m[system:${msg.subtype}]\x1b[0m`);
      }
      break;
    default:
      break;
  }
}

async function cmdMcpReconnect(args: ParsedArgs): Promise<void> {
  const name = args.rest[0];
  if (!name) {
    console.error("Usage: test-sdk.ts mcp-reconnect <server-name>");
    process.exit(1);
  }
  const { q } = await createQuery(args);
  await q.reconnectMcpServer(name);
  console.log(`Reconnected MCP server: ${name}`);
  process.exit(0);
}

async function cmdMcpToggle(args: ParsedArgs): Promise<void> {
  const name = args.rest[0];
  const enabledStr = args.rest[1];
  if (!name || !enabledStr || !["on", "off"].includes(enabledStr)) {
    console.error("Usage: test-sdk.ts mcp-toggle <server-name> <on|off>");
    process.exit(1);
  }
  const { q } = await createQuery(args);
  await q.toggleMcpServer(name, enabledStr === "on");
  console.log(`MCP server ${name}: ${enabledStr}`);
  process.exit(0);
}

async function cmdStopTask(args: ParsedArgs): Promise<void> {
  const taskId = args.rest[0];
  if (!taskId) {
    console.error("Usage: test-sdk.ts stop-task <taskId>");
    process.exit(1);
  }
  const { q } = await createQuery(args);
  await q.stopTask(taskId);
  console.log(`Stopped task: ${taskId}`);
  process.exit(0);
}

async function cmdRewind(args: ParsedArgs): Promise<void> {
  const messageId = args.rest[0];
  if (!messageId) {
    console.error("Usage: test-sdk.ts rewind <messageId> [--dry-run]");
    process.exit(1);
  }
  const dryRun = args.rest.includes("--dry-run");
  const { q } = await createQuery(args);
  const result = await q.rewindFiles(messageId, { dryRun });
  out(args, result, () => {
    console.log(`Rewind result${dryRun ? " (dry run)" : ""}:`);
    console.log(`  Can rewind: ${result.canRewind}`);
    if (result.error) console.log(`  Error: ${result.error}`);
    if (result.filesChanged) console.log(`  Files changed: ${result.filesChanged.join(", ")}`);
    if (result.insertions != null) console.log(`  Insertions: ${result.insertions}`);
    if (result.deletions != null) console.log(`  Deletions: ${result.deletions}`);
  });
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Main dispatch
// ---------------------------------------------------------------------------

const COMMANDS: Record<string, (args: ParsedArgs) => Promise<void>> = {
  init: cmdInit,
  commands: cmdCommands,
  models: cmdModels,
  agents: cmdAgents,
  account: cmdAccount,
  "mcp-status": cmdMcpStatus,
  "set-model": cmdSetModel,
  "set-permission": cmdSetPermission,
  "set-thinking": cmdSetThinking,
  prompt: cmdPrompt,
  "mcp-reconnect": cmdMcpReconnect,
  "mcp-toggle": cmdMcpToggle,
  "stop-task": cmdStopTask,
  rewind: cmdRewind,
};

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.help || !args.subcommand) {
    showHelp();
    process.exit(args.help ? 0 : 1);
  }

  const handler = COMMANDS[args.subcommand];
  if (!handler) {
    console.error(`Unknown subcommand: ${args.subcommand}`);
    console.error(`Run with --help to see available subcommands.`);
    process.exit(1);
  }

  await handler(args);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
