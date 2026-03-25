import type { LucideIcon } from "lucide-react";

import { SquarePen, Wand2 } from "lucide-react";
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
      className={`group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium transition-all ${
        active ? "bg-accent text-accent-foreground" : "text-foreground hover:bg-accent/50"
      } disabled:pointer-events-none disabled:opacity-40`}
      onClick={onClick}
      disabled={disabled}
    >
      <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon size={12} strokeWidth={2} />
      </span>
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
    <div className="mb-2.5">
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
      <div className="mt-2.5 mx-2 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
    </div>
  );
}
