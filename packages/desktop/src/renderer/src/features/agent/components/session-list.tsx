import { useCallback, useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import debug from "debug";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { client } from "../../../orpc";

const listLog = debug("neovate:agent-session-list");
import { Button } from "../../../components/ui/button";
import { useNewSession } from "../hooks/use-new-session";
import { SessionItem } from "./session-item";
import type { ChatSession } from "../store";
import type { SessionInfo } from "../../../../../shared/features/agent/types";

// --- SessionList ---

export function SessionList() {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const agentSessions = useAgentStore((s) => s.agentSessions);
  const createSession = useAgentStore((s) => s.createSession);
  const removeSession = useAgentStore((s) => s.removeSession);
  const appendChunk = useAgentStore((s) => s.appendChunk);
  const setSdkReady = useAgentStore((s) => s.setSdkReady);

  const activeProject = useProjectStore((s) => s.activeProject);
  const archivedSessions = useProjectStore((s) => s.archivedSessions);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const loadSessionPreferences = useProjectStore((s) => s.loadSessionPreferences);

  const { createNewSession } = useNewSession();
  const [restoring, setRestoring] = useState<string | null>(null);

  // Hydrate archived/pinned state from main process on mount / project change
  useEffect(() => {
    if (activeProject?.path) {
      loadSessionPreferences(activeProject.path);
    }
  }, [activeProject?.path, loadSessionPreferences]);
  const loadAbortRef = useRef<AbortController | null>(null);

  // Abort any in-flight load on unmount
  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      loadAbortRef.current = null;
    };
  }, []);

  const loadSession = useCallback(
    async (sessionId: string) => {
      if (sessions.has(sessionId)) {
        listLog("loadSession: already loaded sid=%s, switching", sessionId.slice(0, 8));
        setActiveSession(sessionId);
        return;
      }

      // Abort any previous in-flight load
      loadAbortRef.current?.abort();
      const ac = new AbortController();
      loadAbortRef.current = ac;

      listLog("loadSession: START sid=%s cwd=%s", sessionId.slice(0, 8), activeProject?.path);
      const t0 = performance.now();
      setRestoring(sessionId);

      const info = agentSessions.find((s) => s.sessionId === sessionId);
      listLog(
        "loadSession: info=%o",
        info ? { title: info.title, cwd: info.cwd } : "not found in agentSessions",
      );
      createSession(
        sessionId,
        info ? { title: info.title, createdAt: info.createdAt, cwd: info.cwd } : undefined,
      );

      try {
        const iterator = await client.agent.loadSession(
          { sessionId, cwd: activeProject?.path },
          { signal: ac.signal },
        );
        let eventCount = 0;
        for await (const event of iterator) {
          eventCount++;
          appendChunk(sessionId, event);
        }
        setSdkReady(sessionId, true);
        listLog(
          "loadSession: SDK ready sid=%s in %dms events=%d",
          sessionId.slice(0, 8),
          Math.round(performance.now() - t0),
          eventCount,
        );
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        listLog(
          "loadSession: FAILED sid=%s in %dms error=%s",
          sessionId.slice(0, 8),
          Math.round(performance.now() - t0),
          error instanceof Error ? error.message : String(error),
        );
        removeSession(sessionId);
      } finally {
        if (loadAbortRef.current === ac) {
          loadAbortRef.current = null;
        }
        setRestoring((prev) => (prev === sessionId ? null : prev));
      }
    },
    [
      sessions,
      setActiveSession,
      createSession,
      removeSession,
      appendChunk,
      setSdkReady,
      agentSessions,
      activeProject?.path,
    ],
  );

  if (!activeProject) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-xs text-muted-foreground">Select a project</p>
      </div>
    );
  }

  const projectPath = activeProject.path;
  const archived = new Set(archivedSessions[projectPath] ?? []);
  const pinned = new Set(pinnedSessions[projectPath] ?? []);
  const matchesProject = (cwd?: string) => cwd?.startsWith(projectPath) ?? false;
  const isArchived = (id: string) => archived.has(id);
  const isPinned = (id: string) => pinned.has(id);

  const loadedIds = new Set(sessions.keys());

  // In-memory sessions filtered by project, excluding archived
  const allInMemory = (Array.from(sessions.values()) as ChatSession[]).filter(
    (s) => matchesProject(s.cwd) && !isArchived(s.sessionId) && !s.isNew,
  );

  // Persisted sessions not loaded, filtered by project, excluding archived
  const allPersisted = agentSessions.filter(
    (s) => !loadedIds.has(s.sessionId) && matchesProject(s.cwd) && !isArchived(s.sessionId),
  );

  // Unified sorted lists: pinned and regular
  type UnifiedItem =
    | { kind: "memory"; session: ChatSession }
    | { kind: "persisted"; info: SessionInfo };

  const toUnified = (items: ChatSession[], persisted: SessionInfo[]): UnifiedItem[] => {
    const mem: UnifiedItem[] = items.map((s) => ({ kind: "memory", session: s }));
    const per: UnifiedItem[] = persisted.map((s) => ({ kind: "persisted", info: s }));
    return [...mem, ...per].sort((a, b) => {
      const aDate = a.kind === "memory" ? a.session.createdAt : a.info.createdAt;
      const bDate = b.kind === "memory" ? b.session.createdAt : b.info.createdAt;
      return bDate.localeCompare(aDate);
    });
  };

  const pinnedItems = toUnified(
    allInMemory.filter((s) => isPinned(s.sessionId)),
    allPersisted.filter((s) => isPinned(s.sessionId)),
  );
  const regularItems = toUnified(
    allInMemory.filter((s) => !isPinned(s.sessionId)),
    allPersisted.filter((s) => !isPinned(s.sessionId)),
  );

  const renderItem = (item: UnifiedItem) => {
    if (item.kind === "memory") {
      const s = item.session;
      return (
        <SessionItem
          key={s.sessionId}
          sessionId={s.sessionId}
          title={s.title}
          createdAt={s.createdAt}
          isActive={s.sessionId === activeSessionId}
          isPinned={isPinned(s.sessionId)}
          isRestoring={false}
          isStreaming={s.streaming}
          hasPendingPermission={s.pendingPermission !== null}
          onClick={() => setActiveSession(s.sessionId)}
          projectPath={projectPath}
        />
      );
    }
    const info = item.info;
    return (
      <SessionItem
        key={info.sessionId}
        sessionId={info.sessionId}
        title={info.title}
        createdAt={info.createdAt}
        isActive={false}
        isPinned={isPinned(info.sessionId)}
        isRestoring={restoring === info.sessionId}
        onClick={() => loadSession(info.sessionId)}
        projectPath={projectPath}
      />
    );
  };

  return (
    <div className="flex flex-1 flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        className="mt-1 w-full"
        onClick={() => {
          if (projectPath) {
            createNewSession(projectPath);
          }
        }}
      >
        <Plus size={14} />
        <span>New Chat</span>
      </Button>

      <ul className="flex flex-col gap-0.5">
        {pinnedItems.length > 0 && (
          <>
            <li className="px-2 pt-2">
              <span className="text-[10px] font-medium text-muted-foreground">Pinned</span>
            </li>
            {pinnedItems.map(renderItem)}
          </>
        )}
        {regularItems.map(renderItem)}
      </ul>
    </div>
  );
}
