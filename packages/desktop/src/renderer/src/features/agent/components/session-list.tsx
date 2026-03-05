import { useCallback, useEffect, useRef, useState } from "react";
import { Pin, PinOff, Archive, Copy, Plus } from "lucide-react";
import debug from "debug";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { client } from "../../../orpc";

const listLog = debug("neovate:agent-session-list");
import { cn } from "../../../lib/utils";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuPopup,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../../components/ui/context-menu";
import { Button } from "../../../components/ui/button";
import { useNewSession } from "../hooks/use-new-session";
import type { ChatSession } from "../store";
import type { SessionInfo } from "../../../../../shared/features/agent/types";

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

// --- SessionItemRow ---

function SessionItemRow({
  sessionId,
  title,
  createdAt,
  isActive,
  isPinned,
  isRestoring,
  subtitle,
  onClick,
  projectPath,
}: {
  sessionId: string;
  title?: string;
  createdAt: string;
  isActive: boolean;
  isPinned: boolean;
  isRestoring: boolean;
  subtitle?: string;
  onClick: () => void;
  projectPath: string;
}) {
  const archiveSession = useProjectStore((s) => s.archiveSession);
  const togglePinSession = useProjectStore((s) => s.togglePinSession);

  const handleCopySessionId = () => {
    navigator.clipboard.writeText(sessionId);
  };

  return (
    <li>
      <ContextMenu>
        <ContextMenuTrigger
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors cursor-pointer group",
            isActive
              ? "bg-accent text-accent-foreground"
              : "text-muted-foreground hover:bg-accent/50",
          )}
          onClick={onClick}
        >
          <div className="flex-1 min-w-0">
            <span className="block truncate">
              {isRestoring ? "Restoring..." : title || sessionId.slice(0, 8)}
            </span>
            <span className="block truncate text-[10px] opacity-60">
              {subtitle ? `${subtitle} · ` : ""}
              {timeAgo(createdAt)}
            </span>
          </div>
          <button
            type="button"
            className="hidden shrink-0 group-hover:block"
            onClick={(e) => {
              e.stopPropagation();
              togglePinSession(projectPath, sessionId);
            }}
          >
            {isPinned ? (
              <PinOff size={12} strokeWidth={1.5} />
            ) : (
              <Pin size={12} strokeWidth={1.5} />
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuPopup>
          <ContextMenuItem onClick={() => togglePinSession(projectPath, sessionId)}>
            {isPinned ? (
              <>
                <PinOff size={14} /> Unpin
              </>
            ) : (
              <>
                <Pin size={14} /> Pin
              </>
            )}
          </ContextMenuItem>
          <ContextMenuItem onClick={() => archiveSession(projectPath, sessionId)}>
            <Archive size={14} /> Archive
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleCopySessionId}>
            <Copy size={14} /> Copy session ID
          </ContextMenuItem>
        </ContextMenuPopup>
      </ContextMenu>
    </li>
  );
}

// --- SessionList ---

export function SessionList() {
  const sessions = useAgentStore((s) => s.sessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);
  const agentSessions = useAgentStore((s) => s.agentSessions);
  const createSession = useAgentStore((s) => s.createSession);
  const removeSession = useAgentStore((s) => s.removeSession);
  const appendChunk = useAgentStore((s) => s.appendChunk);
  const restoreFromCache = useAgentStore((s) => s.restoreFromCache);
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

      // Phase 1: Try loading from cache for instant display
      let hasCachedMessages = false;
      try {
        const cached = await client.agent.getSessionCache({ sessionId });
        if (cached && cached.messages.length > 0) {
          restoreFromCache(sessionId, cached);
          hasCachedMessages = true;
          listLog(
            "loadSession: cache HIT sid=%s msgs=%d in %dms",
            sessionId.slice(0, 8),
            cached.messages.length,
            Math.round(performance.now() - t0),
          );
          // Stop showing "Restoring..." since messages are visible now
          setRestoring((prev) => (prev === sessionId ? null : prev));
        } else {
          listLog("loadSession: cache MISS sid=%s", sessionId.slice(0, 8));
        }
      } catch (error) {
        listLog(
          "loadSession: cache read error sid=%s error=%s",
          sessionId.slice(0, 8),
          error instanceof Error ? error.message : String(error),
        );
      }

      // Phase 2: Resume SDK session (skip replay if we loaded from cache)
      try {
        const iterator = await client.agent.loadSession(
          { sessionId, cwd: activeProject?.path, skipReplay: hasCachedMessages },
          { signal: ac.signal },
        );
        let eventCount = 0;
        for await (const event of iterator) {
          eventCount++;
          appendChunk(sessionId, event);
        }
        setSdkReady(sessionId, true);
        listLog(
          "loadSession: SDK ready sid=%s in %dms events=%d cached=%s",
          sessionId.slice(0, 8),
          Math.round(performance.now() - t0),
          eventCount,
          hasCachedMessages,
        );

        // Save cache for future loads (always save to keep it fresh)
        const session = useAgentStore.getState().sessions.get(sessionId);
        if (session && session.messages.length > 0) {
          client.agent.saveSessionCache({
            sessionId,
            data: {
              messages: session.messages.map((m) => ({
                id: m.id,
                role: m.role,
                content: m.content,
                thinking: m.thinking,
              })),
              title: session.title,
              cwd: session.cwd,
              updatedAt: new Date().toISOString(),
            },
          });
        }
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
        // Only remove session if we didn't already show cached messages
        if (!hasCachedMessages) {
          removeSession(sessionId);
        }
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
      restoreFromCache,
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
        <SessionItemRow
          key={s.sessionId}
          sessionId={s.sessionId}
          title={s.title}
          createdAt={s.createdAt}
          isActive={s.sessionId === activeSessionId}
          isPinned={isPinned(s.sessionId)}
          isRestoring={false}
          subtitle={`${s.messages.length} msg${s.messages.length !== 1 ? "s" : ""}${s.streaming ? " · streaming" : ""}`}
          onClick={() => setActiveSession(s.sessionId)}
          projectPath={projectPath}
        />
      );
    }
    const info = item.info;
    return (
      <SessionItemRow
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
