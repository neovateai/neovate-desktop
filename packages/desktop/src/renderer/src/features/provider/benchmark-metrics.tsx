import { useTranslation } from "react-i18next";

import { Badge } from "../../components/ui/badge";
import {
  formatMs,
  formatTpot,
  formatTps,
  getTpotBadgeVariant,
  getTpsBadgeVariant,
  getTtftBadgeVariant,
} from "./benchmark-utils";

interface BenchmarkMetricsProps {
  ttftMs: number;
  tpot: number;
  tps: number;
  size?: "sm" | "default";
}

export function BenchmarkMetrics({ ttftMs, tpot, tps, size = "sm" }: BenchmarkMetricsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1">
      <Badge
        variant={getTtftBadgeVariant(ttftMs)}
        size={size}
        aria-label={`${t("settings.providers.benchmark.ttft")}: ${formatMs(ttftMs)}`}
      >
        {formatMs(ttftMs)}
      </Badge>
      <Badge
        variant={getTpotBadgeVariant(tpot)}
        size={size}
        aria-label={`${t("settings.providers.benchmark.tpot")}: ${formatTpot(tpot)}`}
      >
        {formatTpot(tpot)}
      </Badge>
      <Badge
        variant={getTpsBadgeVariant(tps)}
        size={size}
        aria-label={`${t("settings.providers.benchmark.tps")}: ${formatTps(tps)}`}
      >
        {formatTps(tps)}
      </Badge>
    </div>
  );
}
