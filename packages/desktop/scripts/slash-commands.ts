#!/usr/bin/env bun

import { resolve } from "node:path";
import { query } from "@anthropic-ai/claude-agent-sdk";

// The SDK refuses to run inside a Claude Code session (detects CLAUDECODE env var).
// Clear it so this script works when invoked from within Claude Code.
delete process.env.CLAUDECODE;

interface ParsedArgs {
  help: boolean;
  json: boolean;
  cwd: string;
}

function parseArgs(): ParsedArgs {
  const args = Bun.argv.slice(2);
  const result: ParsedArgs = { help: false, json: false, cwd: process.cwd() };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      result.help = true;
    } else if (arg === "--json") {
      result.json = true;
    } else if (arg === "--cwd" && i + 1 < args.length) {
      result.cwd = args[++i];
    } else if (!arg.startsWith("-")) {
      result.cwd = arg;
    }
  }

  return result;
}

function showHelp(): void {
  console.log(`
Usage: bun packages/desktop/scripts/slash-commands.ts [options] [cwd]

Get available slash commands from the Claude Agent SDK for a given working directory.

Arguments:
  cwd               Working directory (default: current directory)

Options:
  --cwd <path>      Working directory (alternative to positional arg)
  --json            Output as JSON
  -h, --help        Show this help message

Examples:
  bun packages/desktop/scripts/slash-commands.ts
  bun packages/desktop/scripts/slash-commands.ts --json
  bun packages/desktop/scripts/slash-commands.ts --cwd /path/to/project
  bun packages/desktop/scripts/slash-commands.ts /path/to/project --json
`);
}

class Pushable<T> implements AsyncIterable<T> {
  private resolvers: ((value: IteratorResult<T>) => void)[] = [];
  private done = false;

  end(): void {
    this.done = true;
    for (const resolve of this.resolvers) {
      resolve({ value: undefined as T, done: true });
    }
    this.resolvers.length = 0;
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.done) {
          return Promise.resolve({ value: undefined as T, done: true });
        }
        return new Promise((resolve) => {
          this.resolvers.push(resolve);
        });
      },
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const cwd = resolve(args.cwd);
  const input = new Pushable();

  const q = query({
    prompt: input as AsyncIterable<never>,
    options: {
      model: "sonnet",
      cwd,
      permissionMode: "default",
      settingSources: ["user", "project", "local"],
    },
  });

  const commands = await q.supportedCommands();

  if (args.json) {
    console.log(JSON.stringify({ cwd, commands }, null, 2));
  } else {
    if (commands.length === 0) {
      console.log("No slash commands available.");
    } else {
      console.log(`Slash commands (${commands.length}):`);
      for (const cmd of commands) {
        const desc = cmd.description ? `  ${cmd.description}` : "";
        console.log(`  /${cmd.name}${desc}`);
      }
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
