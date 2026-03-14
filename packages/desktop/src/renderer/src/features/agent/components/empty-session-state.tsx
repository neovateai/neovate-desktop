import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EmptySessionStateProps {
  variant?: "full" | "compact";
}

export function EmptySessionState({ variant = "full" }: EmptySessionStateProps) {
  const { t } = useTranslation();

  if (variant === "compact") {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">{t("session.noConversations")}</p>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="text-center">
        <MessageSquare size={48} strokeWidth={1.5} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">
          {t("session.noConversationsYet")}
        </p>
        <p className="text-xs text-muted-foreground">{t("session.startNewChat")}</p>
      </div>
    </div>
  );
}
