import { spawn, type ChildProcess } from "node:child_process";
import { Writable, Readable } from "node:stream";
import { ClientSideConnection, ndJsonStream, PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import type { AgentInfo } from "../../../shared/features/acp/types";
import { AcpConnection } from "./connection";
import { ClientHandler } from "./client-handler";
import { getShellEnvironment } from "./shell-env";

const MAX_STDERR_LINES = 100;

type ManagedConnection = {
  connection: AcpConnection;
  process: ChildProcess;
  stderr: string[];
};

let nextId = 0;

export class AcpConnectionManager {
  private connections = new Map<string, ManagedConnection>();

  async connect(agent: AgentInfo, cwd?: string): Promise<AcpConnection> {
    const id = `acp-${++nextId}`;

    const shellEnv = await getShellEnvironment();

    // Merge PATH: shell PATH prepended, then process PATH, agent env PATH highest
    const mergedPath = [agent.env?.PATH, shellEnv.PATH, process.env.PATH].filter(Boolean).join(":");

    const env = {
      ...process.env,
      ...shellEnv,
      ...agent.env,
      ...(mergedPath ? { PATH: mergedPath } : {}),
    };

    const agentProcess = spawn(agent.command, agent.args ?? [], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env,
    });

    // Buffer stderr lines for diagnostics
    const stderrLines: string[] = [];
    agentProcess.stderr!.on("data", (chunk: Buffer) => {
      const lines = chunk.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        stderrLines.push(line);
        if (stderrLines.length > MAX_STDERR_LINES) {
          stderrLines.shift();
        }
      }
    });

    const input = Writable.toWeb(agentProcess.stdin!);
    const output = Readable.toWeb(agentProcess.stdout!) as ReadableStream<Uint8Array>;

    const stream = ndJsonStream(input, output);

    // SDK holder to break the TDZ — the callback is invoked synchronously
    // by the constructor before `sdk` is assigned, but `sdkRef.value` is
    // only read later when methods are called on the connection.
    const sdkRef: { value: ClientSideConnection | null } = { value: null };

    let connection!: AcpConnection;

    const sdk = new ClientSideConnection((_agent) => {
      connection = new AcpConnection(id, sdkRef);
      return new ClientHandler(connection);
    }, stream);

    sdkRef.value = sdk;

    await sdk.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    this.connections.set(id, { connection, process: agentProcess, stderr: stderrLines });
    return connection;
  }

  get(id: string): AcpConnection | undefined {
    return this.connections.get(id)?.connection;
  }

  getStderr(id: string): string[] {
    return this.connections.get(id)?.stderr ?? [];
  }

  disconnect(id: string): void {
    const managed = this.connections.get(id);
    if (!managed) return;

    managed.connection.dispose();
    managed.process.kill();
    this.connections.delete(id);
  }

  disconnectAll(): void {
    for (const id of this.connections.keys()) {
      this.disconnect(id);
    }
  }
}
