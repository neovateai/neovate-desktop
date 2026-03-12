/**
 * Benchmark Button Component
 * Reusable button for running benchmark tests on models
 */

import { Gauge, Loader2 } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "../../components/ui/button";
import { useProviderStore } from "./store";

interface BenchmarkButtonProps {
  /** Provider ID */
  providerId: string;
  /** List of model IDs to benchmark */
  modelIds: string[];
  /** Button size variant */
  size?: "default" | "sm" | "icon";
  /** Button variant */
  variant?: "default" | "ghost" | "outline";
  /** Additional CSS classes */
  className?: string;
  /** Optional callback to save provider before benchmark (for unsaved models) */
  onBeforeBenchmark?: () => Promise<void>;
  /** Optional callback when benchmark completes */
  onComplete?: () => void;
}

export function BenchmarkButton({
  providerId,
  modelIds,
  size = "icon",
  variant = "ghost",
  className = "",
  onBeforeBenchmark,
  onComplete,
}: BenchmarkButtonProps) {
  const { t } = useTranslation();
  const benchmarkModel = useProviderStore((s) => s.benchmarkModel);
  const benchmarkingModels = useProviderStore((s) => s.benchmarkingModels);

  // Check if any of the specified models are being benchmarked
  const isBenchmarking = modelIds.some((modelId) =>
    benchmarkingModels.has(`${providerId}:${modelId}`),
  );

  const handleBenchmark = useCallback(async () => {
    // Save provider first if callback provided (for unsaved models)
    if (onBeforeBenchmark) {
      await onBeforeBenchmark();
    }
    // Run all benchmarks in parallel
    await Promise.all(modelIds.map((modelId) => benchmarkModel(providerId, modelId)));
    onComplete?.();
  }, [providerId, modelIds, benchmarkModel, onBeforeBenchmark, onComplete]);

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      onClick={handleBenchmark}
      disabled={isBenchmarking || modelIds.length === 0}
      title={t("settings.providers.benchmarkAll")}
    >
      {isBenchmarking ? (
        size === "icon" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-1" />
            {t("settings.providers.benchmarkRunning")}
          </>
        )
      ) : size === "icon" ? (
        <Gauge className="h-4 w-4" />
      ) : (
        <>
          <Gauge className="h-4 w-4 mr-1" />
          {t("settings.providers.benchmarkAll")}
        </>
      )}
    </Button>
  );
}
