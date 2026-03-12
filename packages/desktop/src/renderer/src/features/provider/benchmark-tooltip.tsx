/**
 * Benchmark Tooltip Component
 * Displays benchmark results for multiple models in a tooltip
 */

import { Activity, AlertCircle, CheckCircle, Clock, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { BenchmarkResult } from "../../../../shared/features/provider/types";

import { Tooltip, TooltipPopup, TooltipTrigger } from "../../components/ui/tooltip";
import {
  formatMs,
  formatTpot,
  formatTps,
  getTpotColorClass,
  getTpsColorClass,
  getTtftColorClass,
} from "./benchmark-utils";

interface BenchmarkTooltipProps {
  /** Map of modelId to benchmark result */
  results: Record<string, BenchmarkResult>;
  /** Children element that triggers the tooltip */
  children: React.ReactNode;
}

export function BenchmarkTooltip({ results, children }: BenchmarkTooltipProps) {
  const { t } = useTranslation();
  const resultEntries = Object.entries(results);

  if (resultEntries.length === 0) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipPopup className="max-w-sm p-3" side="top" align="start">
        <div className="space-y-2">
          <div className="font-medium text-sm border-b pb-1">
            {t("settings.providers.benchmarkResults")}
          </div>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {resultEntries.map(([modelId, result]) => (
              <div key={modelId} className="text-xs space-y-1">
                <div className="font-mono font-medium text-foreground">{modelId}</div>
                {result.success ? (
                  <div className="space-y-1 pl-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded ${getTtftColorClass(result.ttftMs)}`}
                      >
                        <Clock className="h-3 w-3" />
                        TTFT: {formatMs(result.ttftMs)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded ${getTpotColorClass(result.tpot)}`}
                      >
                        <Activity className="h-3 w-3" />
                        TPOT: {formatTpot(result.tpot)}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded ${getTpsColorClass(result.tps)}`}
                      >
                        <Zap className="h-3 w-3" />
                        TPS: {formatTps(result.tps)}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {t("settings.providers.benchmark.totalTime")}: {formatMs(result.totalTimeMs)}{" "}
                      | {t("settings.providers.benchmark.tokens")}: {result.tokensGenerated}
                    </div>
                    <div className="flex items-center gap-1 text-green-500">
                      <CheckCircle className="h-3 w-3" />
                      {t("settings.providers.benchmark.status")}: Success
                    </div>
                  </div>
                ) : (
                  <div className="pl-2 space-y-1">
                    <div className="flex items-center gap-1 text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      {t("settings.providers.benchmark.status")}: Failed
                    </div>
                    {result.error && (
                      <div
                        className="text-destructive/80 truncate max-w-[200px]"
                        title={result.error}
                      >
                        {result.error}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </TooltipPopup>
    </Tooltip>
  );
}
