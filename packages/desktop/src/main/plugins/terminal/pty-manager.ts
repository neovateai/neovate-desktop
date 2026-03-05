import { EventPublisher } from "@orpc/server";
import * as pty from "node-pty";
import type { IPty } from "node-pty";

export interface PtySession {
  pty: IPty;
  publisher: EventPublisher<{ data: string }>;
  /** Aborted when the PTY process exits naturally — signals stream consumers to stop */
  exitController: AbortController;
}

export class PtyManager {
  readonly #sessions = new Map<string, PtySession>();

  spawn(opts: { cwd?: string; cols: number; rows: number }): string {
    const cols = Math.max(1, opts.cols);
    const rows = Math.max(1, opts.rows);
    const shell =
      process.platform === "win32" ? "powershell.exe" : (process.env.SHELL ?? "/bin/sh");

    const publisher = new EventPublisher<{ data: string }>();
    const exitController = new AbortController();

    const term = pty.spawn(shell, [], {
      name: "xterm-256color",
      cols,
      rows,
      cwd: opts.cwd ?? process.env.HOME,
      env: process.env as Record<string, string>,
    });

    term.onData((chunk) => publisher.publish("data", chunk));
    term.onExit(() => exitController.abort());

    const sessionId = crypto.randomUUID();
    this.#sessions.set(sessionId, { pty: term, publisher, exitController });
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
    this.#sessions.delete(sessionId);
    try {
      session.pty.kill();
    } catch {
      // already dead
    }
  }

  killAll(): void {
    for (const sessionId of this.#sessions.keys()) {
      this.kill(sessionId);
    }
  }
}
