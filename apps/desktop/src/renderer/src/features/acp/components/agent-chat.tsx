import { useEffect, useState } from "react";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";
import { useAcpConnect } from "../hooks/use-acp-connect";
import { useAcpPrompt } from "../hooks/use-acp-prompt";
import { useAcpPermission } from "../hooks/use-acp-permission";
import { AgentSelector } from "./agent-selector";
import { WorkdirPicker } from "./workdir-picker";
import { MessageList } from "./message-list";
import { MessageInput } from "./message-input";
import { PermissionDialog } from "./permission-dialog";
import { Button } from "../../../components/ui/button";

export function AgentChat() {
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [cwd, setCwd] = useState("");

  const agents = useAcpStore((s) => s.agents);
  const setAgents = useAcpStore((s) => s.setAgents);
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const sessions = useAcpStore((s) => s.sessions);

  const { connect, connecting } = useAcpConnect();
  const { sendPrompt, cancel } = useAcpPrompt();
  const { resolvePermission } = useAcpPermission();

  const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;

  useEffect(() => {
    client.acp.listAgents().then(setAgents);
  }, [setAgents]);

  const handleConnect = async () => {
    if (!selectedAgentId) return;
    await connect(selectedAgentId, cwd || undefined);
  };

  const handleSend = (message: string) => {
    if (!activeSession) return;
    sendPrompt(activeSession.connectionId, activeSession.sessionId, message);
  };

  const handleCancel = () => {
    if (!activeSession) return;
    cancel(activeSession.connectionId, activeSession.sessionId);
  };

  const handleResolvePermission = (requestId: string, optionId: string) => {
    if (!activeSession) return;
    resolvePermission(activeSession.connectionId, activeSession.sessionId, requestId, optionId);
  };

  if (!activeSession) {
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
      />
    </div>
  );
}
