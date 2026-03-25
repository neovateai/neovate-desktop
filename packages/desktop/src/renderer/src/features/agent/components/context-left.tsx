import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../../components/ui/tooltip";
import { cn } from "../../../lib/utils";
import { useAgentStore } from "../store";

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

type Status = "healthy" | "warning" | "critical";

function getStatus(remainingPct: number): Status {
  if (remainingPct > 50) return "healthy";
  if (remainingPct > 20) return "warning";
  return "critical";
}

export function ContextLeft({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const usage = useAgentStore((s) => s.sessions.get(sessionId)?.usage);
  if (!usage || !usage.contextWindowSize) return null;

  const { remainingPct, contextUsedTokens, contextWindowSize } = usage;
  const usedPct = 100 - remainingPct;
  const status = getStatus(remainingPct);

  const handleClick = () => {
    setClicked(true);
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setClicked(false);
    }
  };

  const trigger = (
    <button
      type="button"
      className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs transition-colors hover:bg-muted"
      onClick={handleClick}
    >
      <ContextIndicator remainingPct={remainingPct} status={status} />
      <span
        className={cn(
          "tabular-nums",
          status === "healthy" && "text-muted-foreground",
          status === "warning" && "text-yellow-600 dark:text-yellow-500",
          status === "critical" && "text-destructive",
        )}
      >
        {remainingPct}%
      </span>
    </button>
  );

  return (
    <TooltipProvider delay={clicked ? 0 : undefined}>
      <Tooltip onOpenChange={handleOpenChange}>
        <TooltipTrigger render={trigger} />
        <TooltipContent side="top" align="end">
          <div className="flex flex-col gap-1 py-0.5">
            <div className="font-medium">{t("chat.context.title")}</div>
            <div className="flex items-center justify-between gap-4 text-muted-foreground">
              <span>{t("chat.context.used")}</span>
              <span className="tabular-nums">{formatTokens(contextUsedTokens)} tokens</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-muted-foreground">
              <span>{t("chat.context.total")}</span>
              <span className="tabular-nums">{formatTokens(contextWindowSize)} tokens</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/15">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  status === "healthy" && "bg-muted-foreground/50",
                  status === "warning" && "bg-yellow-500",
                  status === "critical" && "bg-destructive",
                )}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function ContextIndicator({ remainingPct, status }: { remainingPct: number; status: Status }) {
  const segments = 4;
  const filledSegments = Math.ceil((remainingPct / 100) * segments);

  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 w-1 rounded-sm transition-colors",
            i < filledSegments
              ? status === "healthy"
                ? "bg-muted-foreground/50"
                : status === "warning"
                  ? "bg-yellow-500"
                  : "bg-destructive"
              : "bg-muted-foreground/15",
          )}
        />
      ))}
    </div>
  );
}
