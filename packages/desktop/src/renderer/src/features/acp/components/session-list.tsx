import { useCallback, useState } from "react";
import { useAcpStore } from "../store";
import { useProjectStore } from "../../project/store";
import { client } from "../../../orpc";
import { cn } from "../../../lib/utils";

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function SessionList() {
  const sessions = useAcpStore((s) => s.sessions);
  const activeSessionId = useAcpStore((s) => s.activeSessionId);
  const setActiveSession = useAcpStore((s) => s.setActiveSession);
  const agentSessions = useAcpStore((s) => s.agentSessions);
  const createSession = useAcpStore((s) => s.createSession);
  const appendChunk = useAcpStore((s) => s.appendChunk);
  const activeProject = useProjectStore((s) => s.activeProject);

  const [restoring, setRestoring] = useState<string | null>(null);

  const connectionId = useAcpStore((s) => s.activeConnectionId);

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
        const info = agentSessions.find((s) => s.sessionId === sessionId);
        createSession(
          sessionId,
          connectionId,
          info ? { title: info.title, createdAt: info.createdAt, cwd: info.cwd } : undefined,
        );
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
    [connectionId, sessions, setActiveSession, createSession, appendChunk, agentSessions],
  );

  // No project selected — show nothing
  if (!activeProject) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">Select a project</p>
      </div>
    );
  }

  const projectPath = activeProject.path;
  const matchesProject = (cwd?: string) => cwd?.startsWith(projectPath) ?? false;

  // In-memory session IDs for dedup
  const loadedIds = new Set(sessions.keys());

  // Persisted sessions not already loaded, filtered by project
  const persistedOnly = agentSessions.filter(
    (s) => !loadedIds.has(s.sessionId) && matchesProject(s.cwd),
  );

  // In-memory sessions filtered by project
  const inMemory = Array.from(sessions.values()).filter((s) => matchesProject(s.cwd));
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
              <span className="block truncate font-mono">
                {session.title || session.sessionId.slice(0, 8)}
              </span>
              <span className="block truncate text-[10px] opacity-60">
                {session.messages.length} message{session.messages.length !== 1 && "s"}
                {session.streaming && " \u00b7 streaming"}
                {" \u00b7 "}
                {timeAgo(session.createdAt)}
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
              <span className="block truncate text-[10px] opacity-60">
                {timeAgo(info.createdAt)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
