import { cn } from "../../../lib/utils";
import { useAgentStore } from "../store";

function formatTokens(n: number): string {
  return n >= 1000 ? `${Math.round(n / 1000)}k` : String(n);
}

export function ContextLeft({ sessionId }: { sessionId: string }) {
  const usage = useAgentStore((s) => s.sessions.get(sessionId)?.usage);
  if (!usage || !usage.contextWindowSize) return null;

  const { remainingPct, contextUsedTokens, contextWindowSize } = usage;
  const color =
    remainingPct > 50
      ? "text-muted-foreground"
      : remainingPct > 20
        ? "text-yellow-600 dark:text-yellow-500"
        : "text-destructive";

  return (
    <span
      className={cn("text-xs", color)}
      title={`${formatTokens(contextUsedTokens)} / ${formatTokens(contextWindowSize)} tokens used`}
    >
      ctx {remainingPct}%
    </span>
  );
}
