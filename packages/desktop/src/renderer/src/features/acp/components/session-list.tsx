import { useCallback, useState } from "react";
import { useAcpStore } from "../store";
import { client } from "../../../orpc";
import { cn } from "../../../lib/utils";
import { Button } from "../../../components/ui/button";

export function SessionList() {
  const sessions = useAcpStore((s) => s.sessions);
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);
  const agentSessions = useAcpStore((s) => s.agentSessions);
  const setAgentSessions = useAcpStore((s) => s.setAgentSessions);
  const createSession = useAcpStore((s) => s.createSession);
  const appendChunk = useAcpStore((s) => s.appendChunk);

  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  // Get connectionId from any active in-memory session
  const anySession = Array.from(sessions.values())[0];
  const connectionId = anySession?.connectionId;

  const refresh = useCallback(async () => {
    if (!connectionId) return;
    setLoading(true);
    try {
      const list = await client.acp.listSessions({ connectionId });
      setAgentSessions(list);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [connectionId, setAgentSessions]);

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (!connectionId) return;
      // Already loaded in memory — just switch
      if (sessions.has(sessionId)) {
        setActiveSession(sessionId);
        return;
      }
      setRestoring(sessionId);
      try {
        // Create the store session first so appendChunk has a target
        createSession(sessionId, connectionId);
        const iterator = await client.acp.loadSession({ connectionId, sessionId });
        for await (const event of iterator) {
          appendChunk(sessionId, event);
        }
      } catch {
        // ignore
      } finally {
        setRestoring(null);
      }
    },
    [connectionId, sessions, setActiveSession, createSession, appendChunk],
  );

  // In-memory session IDs for dedup
  const loadedIds = new Set(sessions.keys());

  // Persisted sessions not already loaded
  const persistedOnly = agentSessions.filter((s) => !loadedIds.has(s.sessionId));

  const inMemory = Array.from(sessions.values());
  const hasAnything = inMemory.length > 0 || persistedOnly.length > 0;

  if (!hasAnything) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">No sessions yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {connectionId && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-full text-[10px]"
          onClick={refresh}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      )}

      <ul className="flex flex-col gap-0.5">
        {/* In-memory sessions */}
        {inMemory.map((session) => (
          <li key={session.sessionId}>
            <button
              type="button"
              onClick={() => setActiveSession(session.sessionId)}
              className={cn(
                "w-full rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                session.sessionId === activeSessionId
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50",
              )}
            >
              <span className="block truncate font-mono">{session.sessionId.slice(0, 8)}</span>
              <span className="block truncate text-[10px] opacity-60">
                {session.messages.length} message{session.messages.length !== 1 && "s"}
                {session.streaming && " \u00b7 streaming"}
              </span>
            </button>
          </li>
        ))}

        {/* Persisted sessions (not yet loaded) */}
        {persistedOnly.length > 0 && inMemory.length > 0 && (
          <li className="px-2 pt-1">
            <span className="text-[10px] text-muted-foreground">History</span>
          </li>
        )}
        {persistedOnly.map((info) => (
          <li key={info.sessionId}>
            <button
              type="button"
              onClick={() => loadSession(info.sessionId)}
              disabled={restoring === info.sessionId}
              className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-accent/50"
            >
              <span className="block truncate">
                {restoring === info.sessionId
                  ? "Restoring..."
                  : info.title || info.sessionId.slice(0, 8)}
              </span>
              <span className="block truncate text-[10px] opacity-60">{info.cwd}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
