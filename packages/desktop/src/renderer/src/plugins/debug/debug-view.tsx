import {
  Lightbulb,
  Maximize2,
  RefreshCw,
  X,
  ChevronDown,
  ChevronRight,
  BrainCircuit,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { ActiveSessionInfo } from "../../../../shared/features/agent/types";

import { Button } from "../../components/ui/button";
import { usePluginContext, useRendererApp } from "../../core/app";
import { claudeCodeChatManager } from "../../features/agent/chat-manager";
import { useAgentStore } from "../../features/agent/store";
import { useProjectStore } from "../../features/project/store";
import { client } from "../../orpc";

function projectNameFromCwd(cwd: string, projects: { name: string; path: string }[]): string {
  const match = projects.find((p) => p.path === cwd);
  if (match) return match.name;
  // Fallback to last path segment
  return cwd.split("/").pop() || cwd;
}

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

  const handleIsConfigured = () => {
    const configured = llm.isConfigured();
    setResult(`isConfigured: ${configured}`);
  };

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
    <div className="border-t border-border">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <BrainCircuit className="size-3 text-muted-foreground" />
        <span className="text-xs font-medium uppercase text-muted-foreground">Auxiliary LLM</span>
      </div>
      <div className="px-3 py-2 space-y-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleIsConfigured} disabled={loading}>
            isConfigured
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
    </div>
  );
}

export default function DebugView() {
  const { t } = useTranslation();
  const app = useRendererApp();
  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [loading, setLoading] = useState(false);

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

  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const handleSimulateSuggestion = () => {
    if (!activeSessionId) return;
    const store = claudeCodeChatManager.getChat(activeSessionId)?.store;
    if (!store) return;
    const suggestions = [
      "run the tests",
      "now refactor the authentication module to use the new token validation strategy we discussed and make sure all edge cases are covered",
    ];
    const current = store.getState().promptSuggestion;
    const next = current === suggestions[0] ? suggestions[1] : suggestions[0];
    store.setState({ promptSuggestion: next });
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium uppercase text-muted-foreground">
          {t("debug.activeSessions")}
        </span>
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleSimulateSuggestion}
            title="Simulate prompt suggestion"
            className="size-5"
          >
            <Lightbulb className="size-3" />
          </Button>
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
      <div className="flex-1 overflow-auto">
        {sessions.length === 0 ? (
          <div className="flex items-center justify-center p-4 text-sm text-muted-foreground">
            {t("debug.noActiveSessions")}
          </div>
        ) : (
          sessions.map((session) => (
            <SessionRow key={session.sessionId} session={session} onClosed={refresh} />
          ))
        )}
        <LlmTestSection />
      </div>
    </div>
  );
}
