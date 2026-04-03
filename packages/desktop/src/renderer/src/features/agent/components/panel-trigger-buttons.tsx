import type { LucideIcon } from "lucide-react";

import { Puzzle, SquarePen, Wand2 } from "lucide-react";
import { useTranslation } from "react-i18next";

import { layoutStore, useLayoutStore } from "../../../components/app-layout/store";
import { useNewSession } from "../hooks/use-new-session";

function SidebarActionButton({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-accent/50 hover:text-foreground"
      } disabled:pointer-events-none disabled:opacity-40`}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon
        size={16}
        strokeWidth={1.75}
        className={`shrink-0 transition-colors ${active ? "text-primary" : "text-muted-foreground group-hover:text-primary"}`}
      />
      <span>{label}</span>
    </button>
  );
}

export function PanelTriggerGroup({ projectPath }: { projectPath?: string }) {
  const { t } = useTranslation();
  const { createNewSession } = useNewSession();
  const fullRightPanelId = useLayoutStore((s) => s.fullRightPanelId);
  const openFullRightPanel = useLayoutStore((s) => s.openFullRightPanel);

  return (
    <div className="mb-2.5 flex flex-col gap-0.5">
      <SidebarActionButton
        icon={SquarePen}
        label={t("session.newChat")}
        onClick={() => projectPath && createNewSession(projectPath)}
        disabled={!projectPath}
      />
      <SidebarActionButton
        icon={Wand2}
        label={t("settings.skills")}
        onClick={() =>
          fullRightPanelId === "skills"
            ? layoutStore.getState().closeFullRightPanel()
            : openFullRightPanel("skills")
        }
        active={fullRightPanelId === "skills"}
      />
      <SidebarActionButton
        icon={Puzzle}
        label={t("settings.plugins")}
        onClick={() =>
          fullRightPanelId === "plugins"
            ? layoutStore.getState().closeFullRightPanel()
            : openFullRightPanel("plugins")
        }
        active={fullRightPanelId === "plugins"}
      />
      <div className="mt-2 mx-3 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
    </div>
  );
}
