import type { IPty } from "node-pty";

import { EventPublisher } from "@orpc/server";
import debug from "debug";
import * as pty from "node-pty";
import { homedir } from "node:os";

import type { PluginContext } from "../../core/plugin/types";

import { getSystemShell } from "../../core/shell-service";

const log = debug("neovate:terminal:pty");

export interface PtySession {
  pty: IPty;
  publisher: EventPublisher<{ data: string }>;
  /** Aborted when the PTY process exits naturally — signals stream consumers to stop */
  exitController: AbortController;
}

export class PtyManager {
  readonly #sessions = new Map<string, PtySession>();
  readonly #shell: PluginContext["shell"];

  constructor(shell: PluginContext["shell"]) {
    this.#shell = shell;
  }

  async spawn(opts: { cwd?: string; cols: number; rows: number }): Promise<string> {
    const cols = Math.max(1, opts.cols);
    const rows = Math.max(1, opts.rows);
    const env = await this.#shell.getEnv();
    const shell = env.SHELL ?? getSystemShell();

    const publisher = new EventPublisher<{ data: string }>();
    const exitController = new AbortController();

    const cwd = opts.cwd ?? homedir();
    log("spawning pty", { shell, cwd, cols, rows });

    const term = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env,
    });

    term.onData((chunk) => publisher.publish("data", chunk));
    term.onExit(() => {
      log("pty exited", { sessionId });
      exitController.abort();
    });

    const sessionId = crypto.randomUUID();
    this.#sessions.set(sessionId, { pty: term, publisher, exitController });
    log("pty session created", { sessionId });
    return sessionId;
  }

  write(sessionId: string, data: string): void {
    this.#sessions.get(sessionId)?.pty.write(data);
  }

  resize(sessionId: string, cols: number, rows: number): void {
    if (cols < 1 || rows < 1) return;
    this.#sessions.get(sessionId)?.pty.resize(cols, rows);
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.#sessions.get(sessionId);
  }

  kill(sessionId: string): void {
    const session = this.#sessions.get(sessionId);
    if (!session) return;
    log("killing pty session", { sessionId });
    this.#sessions.delete(sessionId);
    try {
      session.pty.kill();
    } catch {
      // already dead
    }
  }

  killAll(): void {
    const count = this.#sessions.size;
    log("killing all pty sessions", { count });
    for (const sessionId of this.#sessions.keys()) {
      this.kill(sessionId);
    }
  }
}
