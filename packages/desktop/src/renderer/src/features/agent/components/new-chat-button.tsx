import { SquarePen } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "../../../components/ui/button";
import { useNewSession } from "../hooks/use-new-session";

export function NewChatButton({ projectPath }: { projectPath?: string }) {
  const { t } = useTranslation();
  const { createNewSession } = useNewSession();

  return (
    <Button
      variant="ghost"
      size="sm"
      className="mb-2 !h-8 w-full bg-secondary text-secondary-foreground hover:!bg-secondary/80"
      onClick={() => projectPath && createNewSession(projectPath)}
      disabled={!projectPath}
    >
      <SquarePen size={14} />
      <span>{t("session.newChat")}</span>
    </Button>
  );
}
