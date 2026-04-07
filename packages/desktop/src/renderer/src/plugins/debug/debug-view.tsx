import type { ChatStatus } from "ai";

import {
  ChevronDown,
  ChevronRight,
  Lightbulb,
  Maximize2,
  Play,
  RefreshCw,
  X,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ActiveSessionInfo } from "../../../../shared/features/agent/types";

import { Button } from "../../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import { usePluginContext, useRendererApp } from "../../core/app";
import { claudeCodeChatManager } from "../../features/agent/chat-manager";
import { useAgentStore } from "../../features/agent/store";
import { useProjectStore } from "../../features/project/store";
import { client } from "../../orpc";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function projectNameFromCwd(cwd: string, projects: { name: string; path: string }[]): string {
  const match = projects.find((p) => p.path === cwd);
  if (match) return match.name;
  return cwd.split("/").pop() || cwd;
}

const STORAGE_KEY = "debug-view-sections";

function loadSectionState(defaults: Record<string, boolean>): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    // ignore
  }
  return defaults;
}

function saveSectionState(state: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// SectionGroup
// ---------------------------------------------------------------------------

function SectionGroup({
  id,
  title,
  open,
  onToggle,
  badge,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: (id: string) => void;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={open} className="border-b border-border">
      <CollapsibleTrigger
        className="flex w-full items-center gap-2 px-3 py-2"
        onClick={() => onToggle(id)}
      >
        {open ? (
          <ChevronDown className="size-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 text-muted-foreground" />
        )}
        <span className="text-xs font-medium uppercase text-muted-foreground">{title}</span>
        {badge}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// SessionRow (unchanged)
// ---------------------------------------------------------------------------

function SessionRow({ session, onClosed }: { session: ActiveSessionInfo; onClosed: () => void }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const projects = useProjectStore((s) => s.projects);
  const setActiveSession = useAgentStore((s) => s.setActiveSession);

  const projectName = projectNameFromCwd(session.cwd, projects);
  const shortId = session.sessionId.slice(0, 8);

  const handleNavigate = () => {
    setActiveSession(session.sessionId);
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await client.agent.claudeCode.closeSession({ sessionId: session.sessionId });
    onClosed();
  };

  const handleToggleExpand = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent"
        onClick={handleNavigate}
      >
        <button onClick={handleToggleExpand} className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
        <span className="size-2 shrink-0 rounded-full bg-green-500" title={t("debug.active")} />
        <span className="truncate font-mono text-xs text-muted-foreground">{shortId}</span>
        <span className="truncate flex-1">{projectName}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={handleClose}
          title={t("debug.closeSession")}
          className="shrink-0 size-5 text-muted-foreground hover:text-destructive"
        >
          <X className="size-3" />
        </Button>
      </div>
      {expanded && (
        <div className="px-3 pb-2 pl-10 text-xs text-muted-foreground space-y-1">
          <div>
            <span className="font-medium">ID:</span> {session.sessionId}
          </div>
          <div>
            <span className="font-medium">CWD:</span> {session.cwd}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PromptSuggestionLiveRow
// ---------------------------------------------------------------------------

function PromptSuggestionLiveRow({
  sessionId,
  isActive,
}: {
  sessionId: string;
  isActive: boolean;
}) {
  const store = claudeCodeChatManager.getChat(sessionId)?.store;
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [status, setStatus] = useState<ChatStatus>("ready");

  useEffect(() => {
    if (!store) return;
    const s = store.getState();
    setSuggestion(s.promptSuggestion);
    setStatus(s.status);
    return store.subscribe((state) => {
      setSuggestion(state.promptSuggestion);
      setStatus(state.status);
    });
  }, [store]);

  if (!store) {
    return (
      <div className="flex items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
        <span className="font-mono">{sessionId.slice(0, 8)}</span>
        <span className="italic">(no chat)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1 text-xs">
      {isActive ? (
        <span className="size-2 shrink-0 rounded-full bg-green-500" />
      ) : (
        <span className="size-2 shrink-0" />
      )}
      <span
        className={`font-mono ${isActive ? "text-foreground font-medium" : "text-muted-foreground"}`}
      >
        {sessionId.slice(0, 8)}
      </span>
      <StatusBadge status={status} />
      <span className="truncate text-muted-foreground">
        {suggestion ? `"${suggestion}"` : "(none)"}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: ChatStatus }) {
  const colors: Record<ChatStatus, string> = {
    ready: "bg-green-500/15 text-green-600",
    submitted: "bg-yellow-500/15 text-yellow-600",
    streaming: "bg-blue-500/15 text-blue-600",
    error: "bg-red-500/15 text-red-600",
  };

  return (
    <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-medium ${colors[status]}`}>
      {status}
    </span>
  );
}

// ---------------------------------------------------------------------------
// PromptSuggestionsSection
// ---------------------------------------------------------------------------

const SIMULATE_SUGGESTIONS = [
  { label: "Short", value: "run the tests" },
  {
    label: "Long",
    value:
      "now refactor the authentication module to use the new token validation strategy we discussed and make sure all edge cases are covered",
  },
];

function PromptSuggestionsSection({ sessions }: { sessions: ActiveSessionInfo[] }) {
  const activeSessionId = useAgentStore((s) => s.activeSessionId);

  const handleSimulate = (value: string | null) => {
    if (!activeSessionId) return;
    const store = claudeCodeChatManager.getChat(activeSessionId)?.store;
    if (!store) return;
    store.setState({ promptSuggestion: value });
  };

  return (
    <div className="space-y-2 px-3 py-2">
      {/* Live State */}
      <div>
        <div className="flex items-center gap-1.5 pb-1">
          <Lightbulb className="size-3 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase text-muted-foreground">
            Live State
          </span>
        </div>
        {sessions.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-3 py-1">No sessions</div>
        ) : (
          <div className="rounded-md border border-border">
            {sessions.map((s) => (
              <PromptSuggestionLiveRow
                key={s.sessionId}
                sessionId={s.sessionId}
                isActive={s.sessionId === activeSessionId}
              />
            ))}
          </div>
        )}
      </div>

      {/* Simulate */}
      <div>
        <div className="flex items-center gap-1.5 pb-1">
          <Play className="size-3 text-muted-foreground" />
          <span className="text-[10px] font-medium uppercase text-muted-foreground">Simulate</span>
        </div>
        <div className="space-y-1">
          {SIMULATE_SUGGESTIONS.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-auto py-1 px-2 text-xs justify-start flex-1 text-left"
                onClick={() => handleSimulate(s.value)}
                disabled={!activeSessionId}
              >
                <span className="truncate">
                  [{s.label}] {s.value}
                </span>
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              className="h-auto py-1 px-2 text-xs"
              onClick={() => handleSimulate(null)}
              disabled={!activeSessionId}
            >
              <XCircle className="size-3 mr-1" />
              Clear
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LlmTestSection (unchanged)
// ---------------------------------------------------------------------------

function LlmTestSection() {
  const { llm } = usePluginContext();
  const [result, setResult] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const run = async (label: string, fn: () => Promise<string>) => {
    setResult(`[${label}] Running...`);
    setLoading(true);
    try {
      const output = await fn();
      setResult(`[${label}] OK\n${output}`);
    } catch (err) {
      setResult(`[${label}] ERROR\n${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleIsAvailable = () =>
    run("isAvailable", async () => {
      const available = await llm.isAvailable();
      return `isAvailable: ${available}`;
    });

  const handleQuery = () =>
    run("query", async () => {
      const text = await llm.query("Say hello in one sentence.", { maxTokens: 64 });
      return text;
    });

  const handleQueryMessages = () =>
    run("queryMessages", async () => {
      const res = await llm.queryMessages(
        [
          { role: "user", content: "What is 2+2?" },
          { role: "assistant", content: "4" },
          { role: "user", content: "And 3+3?" },
        ],
        { maxTokens: 64 },
      );
      return `model: ${res.model}\nstopReason: ${res.stopReason}\ntokens: ${res.usage.inputTokens}in/${res.usage.outputTokens}out\ncontent: ${res.content}`;
    });

  return (
    <div className="px-3 py-2 space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleIsAvailable} disabled={loading}>
          isAvailable
        </Button>
        <Button variant="outline" size="sm" onClick={handleQuery} disabled={loading}>
          query
        </Button>
        <Button variant="outline" size="sm" onClick={handleQueryMessages} disabled={loading}>
          queryMessages
        </Button>
      </div>
      {result && (
        <pre className="text-xs bg-muted/50 rounded-md p-2 whitespace-pre-wrap break-all max-h-40 overflow-auto font-mono text-muted-foreground">
          {result}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DebugView (main)
// ---------------------------------------------------------------------------

const DEFAULT_SECTIONS: Record<string, boolean> = {
  activeSessions: false,
  promptSuggestions: true,
  auxiliaryLlm: true,
};

export default function DebugView() {
  const { t } = useTranslation();
  const app = useRendererApp();
  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [sections, setSections] = useState(() => loadSectionState(DEFAULT_SECTIONS));

  const toggleSection = useCallback((id: string) => {
    setSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      saveSectionState(next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await client.agent.activeSessions({});
      setSessions(result);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleTestMaximize = () => {
    void app.workbench.layout.maximizePart("contentPanel");
  };

  const sessionCountBadge = useMemo(
    () =>
      sessions.length > 0 ? (
        <span className="rounded-full bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
          {sessions.length}
        </span>
      ) : null,
    [sessions.length],
  );

  return (
    <div className="flex h-full flex-col">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium uppercase text-muted-foreground">Debug View</span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleTestMaximize}
            title={t("debug.maximizePanel")}
            className="size-5"
          >
            <Maximize2 className="size-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={refresh}
            disabled={loading}
            title={t("debug.refresh")}
            className="size-5"
          >
            <RefreshCw className={`size-3 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-auto">
        {/* Active Sessions */}
        <SectionGroup
          id="activeSessions"
          title={t("debug.activeSessions")}
          open={sections.activeSessions}
          onToggle={toggleSection}
          badge={sessionCountBadge}
        >
          <div className="max-h-60 overflow-y-auto">
            {sessions.length === 0 ? (
              <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
                {t("debug.noActiveSessions")}
              </div>
            ) : (
              sessions.map((session) => (
                <SessionRow key={session.sessionId} session={session} onClosed={refresh} />
              ))
            )}
          </div>
        </SectionGroup>

        {/* Prompt Suggestions */}
        <SectionGroup
          id="promptSuggestions"
          title="Prompt Suggestions"
          open={sections.promptSuggestions}
          onToggle={toggleSection}
        >
          <PromptSuggestionsSection sessions={sessions} />
        </SectionGroup>

        {/* Auxiliary LLM */}
        <SectionGroup
          id="auxiliaryLlm"
          title="Auxiliary LLM"
          open={sections.auxiliaryLlm}
          onToggle={toggleSection}
        >
          <LlmTestSection />
        </SectionGroup>
      </div>
    </div>
  );
}
