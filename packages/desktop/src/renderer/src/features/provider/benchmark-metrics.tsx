/**
 * Benchmark Metrics Component
 * Displays TTFT, TPOT, and TPS metrics in a reusable format
 * Follows ModelService logic: TPOT (ms/token) + TPS (1000/tpot)
 */

import { Activity, Clock, Zap } from "lucide-react";

import {
  formatMs,
  formatTpot,
  formatTps,
  getTpotColorClass,
  getTpsColorClass,
  getTtftColorClass,
} from "./benchmark-utils";

interface BenchmarkMetricsProps {
  ttftMs: number;
  tpot: number;
  tps: number;
  size?: "sm" | "md";
  showLabels?: boolean;
}

export function BenchmarkMetrics({
  ttftMs,
  tpot,
  tps,
  size = "md",
  showLabels = false,
}: BenchmarkMetricsProps) {
  const badgeClass =
    size === "sm" ? "text-[10px] px-1 py-0.5 rounded" : "text-xs px-1.5 py-0.5 rounded";

  const iconClass = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";
  const gapClass = size === "sm" ? "gap-1" : "gap-1.5";

  return (
    <div className={`flex items-center ${gapClass}`}>
      {/* TTFT */}
      <span
        className={`inline-flex items-center gap-0.5 ${badgeClass} ${getTtftColorClass(ttftMs)}`}
        title="TTFT: Time To First Token"
      >
        <Clock className={iconClass} />
        {showLabels && <span className="opacity-80">TTFT</span>}
        {formatMs(ttftMs)}
      </span>

      {/* TPOT */}
      <span
        className={`inline-flex items-center gap-0.5 ${badgeClass} ${getTpotColorClass(tpot)}`}
        title="TPOT: Time Per Output Token"
      >
        <Activity className={iconClass} />
        {showLabels && <span className="opacity-80">TPOT</span>}
        {formatTpot(tpot)}
      </span>

      {/* TPS */}
      <span
        className={`inline-flex items-center gap-0.5 ${badgeClass} ${getTpsColorClass(tps)}`}
        title="TPS: Tokens Per Second (1000 / TPOT)"
      >
        <Zap className={iconClass} />
        {showLabels && <span className="opacity-80">TPS</span>}
        {formatTps(tps)}
      </span>
    </div>
  );
}
