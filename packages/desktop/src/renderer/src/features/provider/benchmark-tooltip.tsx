import { useTranslation } from "react-i18next";

import type { BenchmarkResult } from "../../../../shared/features/provider/types";

import {
  formatMs,
  formatTpot,
  formatTps,
  getTpotColorClass,
  getTpsColorClass,
  getTtftColorClass,
} from "./benchmark-utils";

interface BenchmarkTooltipProps {
  result: BenchmarkResult;
}

export function BenchmarkTooltipContent({ result }: BenchmarkTooltipProps) {
  const { t } = useTranslation();

  if (!result.success) {
    return (
      <div className="text-destructive-foreground text-xs">
        {result.error || t("settings.providers.benchmark.failed")}
      </div>
    );
  }

  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t("settings.providers.benchmark.ttft")}</span>
        <span className={getTtftColorClass(result.ttftMs)}>{formatMs(result.ttftMs)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t("settings.providers.benchmark.tpot")}</span>
        <span className={getTpotColorClass(result.tpot)}>{formatTpot(result.tpot)}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t("settings.providers.benchmark.tps")}</span>
        <span className={getTpsColorClass(result.tps)}>{formatTps(result.tps)}</span>
      </div>
      <div className="flex justify-between gap-4 border-t pt-1">
        <span className="text-muted-foreground">{t("settings.providers.benchmark.tokens")}</span>
        <span>{result.tokensGenerated}</span>
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-muted-foreground">{t("settings.providers.benchmark.total")}</span>
        <span>{formatMs(result.totalTimeMs)}</span>
      </div>
    </div>
  );
}
