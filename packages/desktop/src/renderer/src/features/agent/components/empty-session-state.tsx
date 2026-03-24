import { MessageSquare } from "lucide-react";
import { useTranslation } from "react-i18next";

interface EmptySessionStateProps {
  variant?: "full" | "compact";
}

export function EmptySessionState({ variant = "full" }: EmptySessionStateProps) {
  const { t } = useTranslation();

  if (variant === "compact") {
    return (
      <p className="px-2.5 py-2 text-xs text-muted-foreground/60">{t("session.noConversations")}</p>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-muted/50">
          <MessageSquare size={24} strokeWidth={1.5} className="text-muted-foreground/60" />
        </div>
        <p className="text-sm font-medium text-muted-foreground">
          {t("session.noConversationsYet")}
        </p>
        <p className="mt-1 text-xs text-muted-foreground/60">{t("session.startNewChat")}</p>
      </div>
    </div>
  );
}
