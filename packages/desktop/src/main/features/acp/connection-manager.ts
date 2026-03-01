import { AcpClient, resolveAgentCommand, type SessionRecord } from "acpx";
import { ORPCError } from "@orpc/server";
import { AcpConnection } from "./connection";
import { getShellEnvironment } from "./shell-env";

const MAX_STDERR_LINES = 100;

export const AGENT_OVERRIDES: Record<string, string> = {
  claude: "npx -y @zed-industries/claude-agent-acp",
};

type ManagedConnection = {
  connection: AcpConnection;
  client: AcpClient;
  agentCommand: string;
  cwd: string;
  stderr: string[];
  sessionRecords: Map<string, SessionRecord>;
};

export class AcpConnectionManager {
  private connections = new Map<string, ManagedConnection>();
  private nextId = 0;

  async connect(agentName: string, cwd?: string): Promise<AcpConnection> {
    const id = `acp-${++this.nextId}`;
    const shellEnv = await getShellEnvironment();

    const mergedPath = [shellEnv.PATH, process.env.PATH].filter(Boolean).join(":");

    const extraEnv = {
      ...shellEnv,
      ...(mergedPath ? { PATH: mergedPath } : {}),
    };

    const agentCommand = resolveAgentCommand(agentName, AGENT_OVERRIDES);

    const stderrLines: string[] = [];
    const connection = new AcpConnection(id);

    const client = new AcpClient({
      agentCommand,
      cwd: cwd ?? process.cwd(),
      // TODO: implement configurable permission policies (approve-all, approve-reads, deny-all)
      permissionMode: "approve-reads",
      extraEnv,
      onSessionUpdate: (notification) => connection.emitSessionUpdate(notification),
      onRequestPermission: (params) => connection.handlePermissionRequest(params),
      onStderr: (line) => {
        stderrLines.push(line);
        if (stderrLines.length > MAX_STDERR_LINES) stderrLines.shift();
      },
    });

    await client.start();
    connection.setClient(client);

    const resolvedCwd = cwd ?? process.cwd();
    this.connections.set(id, {
      connection,
      client,
      agentCommand,
      cwd: resolvedCwd,
      stderr: stderrLines,
      sessionRecords: new Map(),
    });
    return connection;
  }

  get(id: string): AcpConnection | undefined {
    return this.connections.get(id)?.connection;
  }

  getOrThrow(id: string): AcpConnection {
    const conn = this.connections.get(id);
    if (!conn) {
      throw new ORPCError("NOT_FOUND", {
        defined: true,
        message: `Unknown connection: ${id}`,
      });
    }
    return conn.connection;
  }

  getClient(id: string): AcpClient | undefined {
    return this.connections.get(id)?.client;
  }

  getAgentCommand(id: string): string | undefined {
    return this.connections.get(id)?.agentCommand;
  }

  getCwd(id: string): string | undefined {
    return this.connections.get(id)?.cwd;
  }

  getSessionRecord(connectionId: string, acpSessionId: string): SessionRecord | undefined {
    return this.connections.get(connectionId)?.sessionRecords.get(acpSessionId);
  }

  setSessionRecord(connectionId: string, record: SessionRecord): void {
    this.connections.get(connectionId)?.sessionRecords.set(record.acpSessionId, record);
  }

  getStderr(id: string): string[] {
    return this.connections.get(id)?.stderr ?? [];
  }

  async disconnect(id: string): Promise<void> {
    const managed = this.connections.get(id);
    if (!managed) return;
    managed.connection.dispose();
    await managed.client.close();
    this.connections.delete(id);
  }

  async disconnectAll(): Promise<void> {
    for (const id of this.connections.keys()) {
      await this.disconnect(id);
    }
  }
}
