import { AcpClient, resolveAgentCommand } from "acpx";
import { AcpConnection } from "./connection";
import { getShellEnvironment } from "./shell-env";

const MAX_STDERR_LINES = 100;

export const AGENT_OVERRIDES: Record<string, string> = {
  claude: "npx -y @zed-industries/claude-code-acp",
};

type ManagedConnection = {
  connection: AcpConnection;
  client: AcpClient;
  stderr: string[];
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

    this.connections.set(id, { connection, client, stderr: stderrLines });
    return connection;
  }

  get(id: string): AcpConnection | undefined {
    return this.connections.get(id)?.connection;
  }

  getClient(id: string): AcpClient | undefined {
    return this.connections.get(id)?.client;
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
