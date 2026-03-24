import { SquarePen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useNewSession } from "../hooks/use-new-session";

export function NewChatButton({ projectPath }: { projectPath?: string }) {
  const { t } = useTranslation();
  const { createNewSession } = useNewSession();

  return (
    <div>
      <button
        className="group flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-accent/50 hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        onClick={() => projectPath && createNewSession(projectPath)}
        disabled={!projectPath}
      >
        <span className="flex size-5 items-center justify-center rounded bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <SquarePen size={12} strokeWidth={2} />
        </span>
        <span>{t("session.newChat")}</span>
      </button>
      <div className="mt-2.5 mx-2 h-px bg-gradient-to-r from-transparent via-border/60 to-transparent" />
    </div>
  );
}
