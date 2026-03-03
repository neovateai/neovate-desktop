import { useEffect, useRef, useState } from "react";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";
import { useProjectStore } from "../../project/store";
import { useAcpConnect } from "../hooks/use-acp-connect";
import { useAcpPrompt } from "../hooks/use-acp-prompt";
import { useAcpPermission } from "../hooks/use-acp-permission";
import { AgentSelector } from "./agent-selector";
import { WorkdirPicker } from "./workdir-picker";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { PermissionDialog } from "./permission-dialog";
import { Button } from "../../../components/ui/button";
import { WelcomePanel } from "./welcome-panel";

export function AgentChat() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const activeProject = useProjectStore((s) => s.activeProject);
  const activeProjectPath = activeProject?.path ?? "";
  const [cwd, setCwd] = useState("");

  const agents = useAcpStore((s) => s.agents);
  const setAgents = useAcpStore((s) => s.setAgents);
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);
  const activeConnectionId = useAcpStore((s) => s.activeConnectionId);
  const sessions = useAcpStore((s) => s.sessions);

  const setActiveConnectionId = useAcpStore((s) => s.setActiveConnectionId);
  const setAgentSessions = useAcpStore((s) => s.setAgentSessions);
  const getConnectionForProject = useAcpStore((s) => s.getConnectionForProject);
  const setConnectionForProject = useAcpStore((s) => s.setConnectionForProject);

  const { connect, connecting } = useAcpConnect();
  const { sendPrompt, cancel } = useAcpPrompt();
  const { resolvePermission } = useAcpPermission();

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;

  // Track the project path we last auto-connected for, to avoid re-triggering
  const autoConnectedPathRef = useRef<string | null>(null);

  useEffect(() => {
    client.acp.listAgents().then(setAgents);
  }, [setAgents]);

  // On project switch: restore existing connection or clear for auto-connect
  useEffect(() => {
    if (activeProjectPath) setCwd(activeProjectPath);
    setActiveSession(null);

    if (!activeProjectPath) {
      setActiveConnectionId(null);
      setAgentSessions([]);
      return;
    }

    const existing = getConnectionForProject(activeProjectPath);
    if (existing) {
      setActiveConnectionId(existing);
      // Re-fetch persisted sessions for the restored connection
      client.acp
        .listSessions({ connectionId: existing })
        .then((sessions) => {
          setAgentSessions(sessions);
          // Preload sessions
          if (sessions.length > 0) {
            const sessionIds = [...sessions]
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((s) => s.sessionId);
            client.acp
              .preloadSessions({
                connectionId: existing,
                sessionIds,
                cwd: activeProjectPath,
              })
              .catch(() => {});
          }
        })
        .catch(() => setAgentSessions([]));
    } else {
      setActiveConnectionId(null);
      setAgentSessions([]);
    }
  }, [
    activeProjectPath,
    setActiveSession,
    setActiveConnectionId,
    setAgentSessions,
    getConnectionForProject,
  ]);

  // Auto-connect to "claude" when a project is active and no connection exists
  useEffect(() => {
    if (!activeProjectPath) return;
    if (activeConnectionId) return;
    if (connecting) return;
    if (autoConnectedPathRef.current === activeProjectPath) return;

    autoConnectedPathRef.current = activeProjectPath;
    connect("claude", activeProjectPath)
      .then(({ connectionId }) => {
        setConnectionForProject(activeProjectPath, connectionId);
      })
      .catch(() => {});
  }, [activeProjectPath, activeConnectionId, connecting, connect, setConnectionForProject]);

  const handleConnect = async () => {
    if (!selectedAgentId) return;
    const result = await connect(selectedAgentId, cwd || undefined);
    if (cwd && result) {
      setConnectionForProject(cwd, result.connectionId);
    }
  };

  const handleSend = (message: string) => {
    if (!activeConnectionId) return;
    sendPrompt(activeConnectionId, activeSession?.sessionId, message);
  };

  const handleCancel = () => {
    if (!activeSession) return;
    cancel(activeSession.connectionId, activeSession.sessionId);
  };

  const handleResolvePermission = (requestId: string, optionId: string) => {
    if (!activeSession) return;
    resolvePermission(activeSession.connectionId, activeSession.sessionId, requestId, optionId);
  };

  // State 1: No connection — show agent selector
  if (!activeConnectionId && !activeSession && !connecting) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-8">
        <h2 className="text-xl font-semibold">Connect to an Agent</h2>
        <div className="flex w-full max-w-md flex-col gap-3">
          <AgentSelector
            agents={agents}
            selectedId={selectedAgentId}
            onSelect={setSelectedAgentId}
            disabled={connecting}
          />
          <WorkdirPicker value={cwd} onChange={setCwd} disabled={connecting} />
          <Button onClick={handleConnect} disabled={!selectedAgentId || connecting}>
            {connecting ? "Connecting..." : "Connect"}
          </Button>
        </div>
      </div>
    );
  }

  // State 2: Connected but no session yet — show welcome panel with input
  if (!activeSession) {
    return (
      <div className="flex h-full flex-col">
        <WelcomePanel />
        <MessageInput onSend={handleSend} onCancel={() => {}} streaming={false} cwd={cwd} />
      </div>
    );
  }

  // State 3: Active session — full chat
  return (
    <div className="flex h-full flex-col">
      <MessageList messages={activeSession.messages} toolCalls={activeSession.toolCalls} />
      {activeSession.pendingPermission && (
        <PermissionDialog
          permission={activeSession.pendingPermission}
          onResolve={handleResolvePermission}
        />
      )}
      {activeSession.promptError && (
        <div className="mx-4 mb-2 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-700">
          {activeSession.promptError}
        </div>
      )}
      <MessageInput
        onSend={handleSend}
        onCancel={handleCancel}
        streaming={activeSession.streaming}
        cwd={cwd}
      />
    </div>
  );
}
