import { Gauge, Square } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, type ButtonProps } from "../../components/ui/button";
import { useProviderStore } from "./store";

interface BenchmarkButtonProps {
  providerId: string;
  modelIds: string[];
  onBeforeBenchmark?: () => Promise<void>;
  onComplete?: () => void;
  disabled?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}

export function BenchmarkButton({
  providerId,
  modelIds,
  onBeforeBenchmark,
  onComplete,
  disabled,
  size = "sm",
  variant = "outline",
  className,
}: BenchmarkButtonProps) {
  const { t } = useTranslation();
  const benchmarkAll = useProviderStore((s) => s.benchmarkAll);
  const cancelBenchmarks = useProviderStore((s) => s.cancelBenchmarks);
  const benchmarkingModels = useProviderStore((s) => s.benchmarkingModels);
  const [running, setRunning] = useState(false);

  const isAnyRunning = running || modelIds.some((id) => benchmarkingModels[`${providerId}:${id}`]);

  const showLabel = size !== "icon" && size !== "icon-sm" && size !== "icon-xs";

  const handleClick = useCallback(async () => {
    if (isAnyRunning) {
      cancelBenchmarks();
      setRunning(false);
      return;
    }
    if (modelIds.length === 0) return;
    setRunning(true);
    try {
      if (onBeforeBenchmark) {
        await onBeforeBenchmark();
      }
      await benchmarkAll(providerId, modelIds);
      onComplete?.();
    } catch (e) {
      // AbortError is expected on cancel
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        console.error("Benchmark failed:", e);
      }
    } finally {
      setRunning(false);
    }
  }, [
    isAnyRunning,
    modelIds,
    providerId,
    benchmarkAll,
    cancelBenchmarks,
    onBeforeBenchmark,
    onComplete,
  ]);

  if (isAnyRunning) {
    return (
      <Button
        variant="destructive-outline"
        size={size}
        className={className}
        onClick={handleClick}
        aria-label={t("settings.providers.benchmark.cancel")}
      >
        <Square className="h-3 w-3" />
        {showLabel && <span>{t("settings.providers.benchmark.cancel")}</span>}
      </Button>
    );
  }

  return (
    <Button
      variant={variant}
      size={size}
      className={className}
      disabled={disabled || modelIds.length === 0}
      onClick={handleClick}
      aria-label={t("settings.providers.benchmark.testAll")}
    >
      <Gauge className="h-3.5 w-3.5" />
      {showLabel && <span>{t("settings.providers.benchmark.test")}</span>}
    </Button>
  );
}
