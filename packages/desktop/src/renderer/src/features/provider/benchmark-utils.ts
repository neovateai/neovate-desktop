type ColorClass =
  | "text-success-foreground"
  | "text-warning-foreground"
  | "text-destructive-foreground";
type BadgeVariant = "success" | "warning" | "error";

export function getTtftColorClass(ttftMs: number): ColorClass {
  if (ttftMs < 500) return "text-success-foreground";
  if (ttftMs > 2000) return "text-destructive-foreground";
  return "text-warning-foreground";
}

export function getTpotColorClass(tpot: number): ColorClass {
  if (tpot < 20) return "text-success-foreground";
  if (tpot > 60) return "text-destructive-foreground";
  return "text-warning-foreground";
}

export function getTpsColorClass(tps: number): ColorClass {
  if (tps > 100) return "text-success-foreground";
  if (tps < 20) return "text-destructive-foreground";
  return "text-warning-foreground";
}

export function getTtftBadgeVariant(ttftMs: number): BadgeVariant {
  if (ttftMs < 500) return "success";
  if (ttftMs > 2000) return "error";
  return "warning";
}

export function getTpotBadgeVariant(tpot: number): BadgeVariant {
  if (tpot < 20) return "success";
  if (tpot > 60) return "error";
  return "warning";
}

export function getTpsBadgeVariant(tps: number): BadgeVariant {
  if (tps > 100) return "success";
  if (tps < 20) return "error";
  return "warning";
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function formatTpot(tpot: number): string {
  return `${tpot.toFixed(1)}ms`;
}

export function formatTps(tps: number): string {
  return `${tps.toFixed(1)} t/s`;
}
