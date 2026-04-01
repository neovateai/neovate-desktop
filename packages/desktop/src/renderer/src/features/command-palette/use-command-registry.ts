import { Comment01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  MessageSquarePlus,
  MessageCircle,
  ChevronLeft,
  ChevronRight,
  Settings,
  Sun,
  Moon,
  PanelLeft,
  Terminal,
  GitBranch,
  Globe,
  FolderOpen,
  Pin,
  PinOff,
  Archive,
  Copy,
  LayoutGrid,
  RefreshCw,
} from "lucide-react";
import { useTheme } from "next-themes";
import { createElement, useMemo } from "react";

import type { CommandItem } from "./types";

import { PLAYGROUND_PROJECT_ID } from "../../../../shared/features/project/constants";
import { layoutStore } from "../../components/app-layout/store";
import { toastManager } from "../../components/ui/toast";
import { useRendererApp } from "../../core/app";
import { formatKeyForDisplay, DEFAULT_KEYBINDINGS } from "../../lib/keybindings";
import { useLoadSession } from "../agent/hooks/use-load-session";
import { useNewSession } from "../agent/hooks/use-new-session";
import { navigateSession } from "../agent/navigate-session";
import { useAgentStore } from "../agent/store";
import { useConfigStore } from "../config/store";
import { useProjectStore } from "../project/store";
import { useSettingsStore } from "../settings/store";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const seconds = Math.floor(diff / 1000);
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

function projectNameFromCwd(cwd?: string): string | undefined {
  if (!cwd) return undefined;
  return cwd.split("/").filter(Boolean).pop();
}

function shortcutFor(action: string): string[] | undefined {
  const config = useConfigStore.getState();
  const keybindings = { ...DEFAULT_KEYBINDINGS, ...config.keybindings };
  const binding = keybindings[action as keyof typeof keybindings];
  return binding ? formatKeyForDisplay(binding) : undefined;
}

function SessionIcon({ className }: { className?: string }) {
  return createElement(HugeiconsIcon, {
    icon: Comment01Icon,
    size: 16,
    strokeWidth: 1.5,
    className,
  });
}

export function useCommandRegistry() {
  const { resolvedTheme, setTheme } = useTheme();
  const { createNewSession } = useNewSession();
  const loadSession = useLoadSession();
  const app = useRendererApp();
  const agentSessions = useAgentStore((s) => s.agentSessions);
  const activeSessionId = useAgentStore((s) => s.activeSessionId);
  const sessions = useAgentStore((s) => s.sessions);
  const activeProject = useProjectStore((s) => s.activeProject);
  const projects = useProjectStore((s) => s.projects);
  const pinnedSessions = useProjectStore((s) => s.pinnedSessions);
  const archivedSessions = useProjectStore((s) => s.archivedSessions);
  const multiProjectSupport = useConfigStore((s) => s.multiProjectSupport);

  const commands: CommandItem[] = useMemo(() => {
    const projectPath = activeProject?.path;
    const archivedIds = new Set(projectPath ? (archivedSessions[projectPath] ?? []) : []);
    const pinnedIds = new Set(projectPath ? (pinnedSessions[projectPath] ?? []) : []);
    const activeSession = activeSessionId ? sessions.get(activeSessionId) : undefined;
    const isActiveSessionPinned = activeSessionId ? pinnedIds.has(activeSessionId) : false;
    const isActiveSessionNew = activeSession?.isNew ?? true;

    const items: CommandItem[] = [
      // --- Session ---
      {
        id: "newChat",
        label: "New Chat",
        group: "command",
        category: "Session",
        icon: MessageSquarePlus,
        shortcut: shortcutFor("newChat"),
        keywords: ["new", "chat", "session", "create"],
        onSelect: () => {
          if (projectPath) createNewSession(projectPath);
        },
      },
      {
        id: "prevSession",
        label: "Previous Session",
        group: "command",
        category: "Session",
        icon: ChevronLeft,
        shortcut: shortcutFor("prevSession"),
        keywords: ["previous", "back", "session"],
        onSelect: () => navigateSession("prev"),
      },
      {
        id: "nextSession",
        label: "Next Session",
        group: "command",
        category: "Session",
        icon: ChevronRight,
        shortcut: shortcutFor("next"),
        keywords: ["next", "forward", "session"],
        onSelect: () => navigateSession("next"),
      },
      {
        id: "pinSession",
        label: "Pin Session",
        group: "command",
        category: "Session",
        icon: Pin,
        shortcut: shortcutFor("togglePinSession"),
        keywords: ["pin", "favorite"],
        when: () => !isActiveSessionNew && !isActiveSessionPinned,
        onSelect: () => {
          if (projectPath && activeSessionId) {
            useProjectStore.getState().togglePinSession(projectPath, activeSessionId);
          }
        },
      },
      {
        id: "unpinSession",
        label: "Unpin Session",
        group: "command",
        category: "Session",
        icon: PinOff,
        shortcut: shortcutFor("togglePinSession"),
        keywords: ["unpin", "unfavorite"],
        when: () => !isActiveSessionNew && isActiveSessionPinned,
        onSelect: () => {
          if (projectPath && activeSessionId) {
            useProjectStore.getState().togglePinSession(projectPath, activeSessionId);
          }
        },
      },
      {
        id: "archiveSession",
        label: "Archive Session",
        group: "command",
        category: "Session",
        icon: Archive,
        keywords: ["archive", "delete", "remove"],
        when: () => !isActiveSessionNew && !archivedIds.has(activeSessionId ?? ""),
        onSelect: () => {
          if (projectPath && activeSessionId) {
            useProjectStore.getState().archiveSession(projectPath, activeSessionId, true);
          }
        },
      },
      {
        id: "copyPath",
        label: "Copy Project Path",
        group: "command",
        category: "Session",
        icon: Copy,
        shortcut: shortcutFor("copyPath"),
        keywords: ["copy", "path", "project"],
        onSelect: () => {
          if (projectPath) {
            navigator.clipboard.writeText(projectPath);
            toastManager.add({
              type: "success",
              title: "Path copied",
              description: projectPath,
            });
          }
        },
      },

      // --- Panels ---
      {
        id: "toggleTerminal",
        label: "Toggle Terminal",
        group: "command",
        category: "Panels",
        icon: Terminal,
        shortcut: shortcutFor("toggleTerminal"),
        keywords: ["terminal", "shell", "console"],
        stateLabel: () => {
          const store = app.workbench.contentPanel.store.getState();
          const tab = store.findTabByViewType(projectPath ?? "", "terminal");
          return tab ? "on" : "off";
        },
        onSelect: () => app.workbench.contentPanel.toggleView("terminal"),
      },
      {
        id: "toggleChanges",
        label: "Toggle Changes",
        group: "command",
        category: "Panels",
        icon: GitBranch,
        shortcut: shortcutFor("toggleChanges"),
        keywords: ["changes", "diff", "git"],
        stateLabel: () => {
          const store = app.workbench.contentPanel.store.getState();
          const tab = store.findTabByViewType(projectPath ?? "", "changes");
          return tab ? "on" : "off";
        },
        onSelect: () => app.workbench.contentPanel.toggleView("changes"),
      },
      {
        id: "toggleBrowser",
        label: "Toggle Browser",
        group: "command",
        category: "Panels",
        icon: Globe,
        shortcut: shortcutFor("toggleBrowser"),
        keywords: ["browser", "web", "preview"],
        stateLabel: () => {
          const store = app.workbench.contentPanel.store.getState();
          const tab = store.findTabByViewType(projectPath ?? "", "browser");
          return tab ? "on" : "off";
        },
        onSelect: () => app.workbench.contentPanel.toggleView("browser"),
      },
      {
        id: "toggleFiles",
        label: "Toggle Files",
        group: "command",
        category: "Panels",
        icon: FolderOpen,
        shortcut: shortcutFor("toggleFiles"),
        keywords: ["files", "explorer", "file browser"],
        onSelect: () => layoutStore.getState().setSecondarySidebarActiveView("files"),
      },
      {
        id: "toggleSidebar",
        label: "Toggle Sidebar",
        group: "command",
        category: "Panels",
        icon: PanelLeft,
        shortcut: shortcutFor("toggleSidebar"),
        keywords: ["sidebar", "panel", "sessions"],
        stateLabel: () => {
          const panels = layoutStore.getState().panels;
          return panels.primarySidebar.collapsed ? "off" : "on";
        },
        onSelect: () => layoutStore.getState().togglePanel("primarySidebar"),
      },

      // --- App ---
      {
        id: "openSettings",
        label: "Open Settings",
        group: "command",
        category: "App",
        icon: Settings,
        shortcut: shortcutFor("openSettings"),
        keywords: ["settings", "preferences", "config"],
        onSelect: () => useSettingsStore.getState().setShowSettings(true),
      },
      {
        id: "toggleTheme",
        label: "Toggle Theme",
        group: "command",
        category: "App",
        icon: resolvedTheme === "dark" ? Sun : Moon,
        shortcut: shortcutFor("toggleTheme"),
        keywords: ["theme", "dark", "light", "mode"],
        stateLabel: () => resolvedTheme ?? "system",
        onSelect: () => {
          const newTheme = resolvedTheme === "dark" ? "light" : "dark";
          setTheme(newTheme);
          useConfigStore.getState().setConfig("theme", newTheme);
        },
      },
      {
        id: "toggleMultiProject",
        label: "Toggle Multi-Project",
        group: "command",
        category: "App",
        icon: LayoutGrid,
        shortcut: shortcutFor("toggleMultiProject"),
        keywords: ["multi", "project", "workspace"],
        stateLabel: () => (multiProjectSupport ? "on" : "off"),
        onSelect: () => {
          useConfigStore.getState().setConfig("multiProjectSupport", !multiProjectSupport);
        },
      },
      {
        id: "reloadWindow",
        label: "Reload Window",
        group: "command",
        category: "App",
        icon: RefreshCw,
        keywords: ["reload", "refresh", "restart"],
        onSelect: () => window.location.reload(),
      },
    ];

    return items;
  }, [
    activeProject,
    activeSessionId,
    sessions,
    pinnedSessions,
    archivedSessions,
    multiProjectSupport,
    resolvedTheme,
    setTheme,
    createNewSession,
    app,
  ]);

  const sessionItems: CommandItem[] = useMemo(() => {
    const projectPath = activeProject?.path;
    const archivedIds = new Set(projectPath ? (archivedSessions[projectPath] ?? []) : []);

    const playgroundPaths = new Set(
      projects.filter((p) => p.id === PLAYGROUND_PROJECT_ID).map((p) => p.path),
    );
    const isPlaygroundSession = (cwd?: string) =>
      cwd ? [...playgroundPaths].some((pp) => cwd.startsWith(pp)) : false;

    // Combine in-memory sessions with persisted ones
    const seen = new Set<string>();
    const items: CommandItem[] = [];

    // Add persisted sessions (most complete list)
    for (const info of agentSessions) {
      if (archivedIds.has(info.sessionId)) continue;
      // In single-project mode, only show sessions for active project
      if (!multiProjectSupport && projectPath && info.cwd && !info.cwd.startsWith(projectPath)) {
        continue;
      }
      seen.add(info.sessionId);

      // Try to get first user message from in-memory session for preview
      const memSession = sessions.get(info.sessionId);
      const firstUserMsg = memSession?.messages.find((m) => m.role === "user");
      const preview = firstUserMsg?.content.slice(0, 100);

      const isLoaded = !!memSession;
      const time = formatRelativeTime(info.createdAt);
      const project = projectNameFromCwd(info.cwd);
      const metadata = project ? `${time} · ${project}` : time;
      items.push({
        id: `session:${info.sessionId}`,
        label: info.title || "Untitled",
        group: "session",
        icon: isPlaygroundSession(info.cwd) ? MessageCircle : SessionIcon,
        keywords: [info.title ?? "", preview ?? ""].filter(Boolean),
        preview,
        metadata,
        onSelect: () => {
          if (isLoaded) {
            useAgentStore.getState().setActiveSession(info.sessionId);
          } else {
            loadSession(info.sessionId);
          }
        },
      });
    }

    // Add in-memory sessions not yet persisted
    for (const [, session] of sessions) {
      if (seen.has(session.sessionId) || session.isNew) continue;
      if (archivedIds.has(session.sessionId)) continue;
      if (
        !multiProjectSupport &&
        projectPath &&
        session.cwd &&
        !session.cwd.startsWith(projectPath)
      ) {
        continue;
      }

      const firstUserMsg = session.messages.find((m) => m.role === "user");
      const preview = firstUserMsg?.content.slice(0, 100);

      const time = formatRelativeTime(session.createdAt);
      const project = projectNameFromCwd(session.cwd);
      const metadata = project ? `${time} · ${project}` : time;
      items.push({
        id: `session:${session.sessionId}`,
        label: session.title || "Untitled",
        group: "session",
        icon: isPlaygroundSession(session.cwd) ? MessageCircle : SessionIcon,
        keywords: [session.title ?? "", preview ?? ""].filter(Boolean),
        preview,
        metadata,
        onSelect: () => {
          useAgentStore.getState().setActiveSession(session.sessionId);
        },
      });
    }

    return items;
  }, [
    agentSessions,
    sessions,
    activeProject,
    archivedSessions,
    multiProjectSupport,
    projects,
    loadSession,
  ]);

  return { commands, sessionItems };
}
