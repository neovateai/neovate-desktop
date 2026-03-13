import { ChevronDown, Gauge, Square } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button, type ButtonProps } from "../../components/ui/button";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../../components/ui/menu";
import { useProviderStore } from "./store";

interface BenchmarkButtonProps {
  baseURL: string;
  apiKey: string;
  models: Record<string, { displayName?: string }>;
  onComplete?: () => void;
  disabled?: boolean;
  size?: ButtonProps["size"];
  variant?: ButtonProps["variant"];
  className?: string;
}

export function BenchmarkButton({
  baseURL,
  apiKey,
  models,
  onComplete,
  disabled,
  size = "sm",
  variant = "outline",
  className,
}: BenchmarkButtonProps) {
  const { t } = useTranslation();
  const checkAll = useProviderStore((s) => s.checkAll);
  const cancelBenchmarks = useProviderStore((s) => s.cancelBenchmarks);
  const benchmarkingModels = useProviderStore((s) => s.benchmarkingModels);
  const [running, setRunning] = useState(false);

  const modelIds = Object.keys(models);
  const isAnyRunning = running || modelIds.some((id) => benchmarkingModels[`${baseURL}:${id}`]);

  const showLabel = size !== "icon" && size !== "icon-sm" && size !== "icon-xs";
  const hasMultipleModels = modelIds.length > 1;

  const handleTestAll = useCallback(async () => {
    if (isAnyRunning) {
      cancelBenchmarks();
      setRunning(false);
      return;
    }
    if (modelIds.length === 0) return;
    setRunning(true);
    try {
      await checkAll(baseURL, apiKey, modelIds);
      onComplete?.();
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        console.error("Benchmark failed:", e);
      }
    } finally {
      setRunning(false);
    }
  }, [isAnyRunning, modelIds, baseURL, apiKey, checkAll, cancelBenchmarks, onComplete]);

  const handleTestSingle = useCallback(
    async (modelId: string) => {
      if (isAnyRunning) return;
      setRunning(true);
      try {
        await checkAll(baseURL, apiKey, [modelId]);
        onComplete?.();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          console.error("Benchmark failed:", e);
        }
      } finally {
        setRunning(false);
      }
    },
    [isAnyRunning, baseURL, apiKey, checkAll, onComplete],
  );

  if (isAnyRunning) {
    return (
      <Button
        variant="destructive-outline"
        size={size}
        className={className}
        onClick={handleTestAll}
        aria-label={t("settings.providers.benchmark.cancel")}
      >
        <Square className="h-3 w-3" />
        {showLabel && <span>{t("settings.providers.benchmark.cancel")}</span>}
      </Button>
    );
  }

  if (!hasMultipleModels) {
    return (
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={disabled || modelIds.length === 0}
        onClick={handleTestAll}
        aria-label={t("settings.providers.benchmark.testAll")}
      >
        <Gauge className="h-3.5 w-3.5" />
        {showLabel && <span>{t("settings.providers.benchmark.test")}</span>}
      </Button>
    );
  }

  return (
    <div className="inline-flex">
      <Button
        variant={variant}
        size={size}
        className={`${className ?? ""} rounded-r-none border-r-0`}
        disabled={disabled}
        onClick={handleTestAll}
        aria-label={t("settings.providers.benchmark.testAll")}
      >
        <Gauge className="h-3.5 w-3.5" />
        {showLabel && <span>{t("settings.providers.benchmark.test")}</span>}
      </Button>
      <Menu>
        <MenuTrigger
          className={`inline-flex items-center justify-center rounded-l-none border border-input bg-popover px-1 text-foreground shadow-xs/5 hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-64 ${size === "xs" ? "h-7 sm:h-6" : size === "sm" ? "h-8 sm:h-7" : "h-9 sm:h-8"}`}
          disabled={disabled}
        >
          <ChevronDown className="h-3 w-3" />
        </MenuTrigger>
        <MenuPopup align="end" side="bottom" sideOffset={4}>
          {modelIds.map((id) => (
            <MenuItem key={id} onClick={() => handleTestSingle(id)}>
              <code className="text-xs">{id}</code>
              {models[id]?.displayName && (
                <span className="text-muted-foreground text-xs ml-2">{models[id].displayName}</span>
              )}
            </MenuItem>
          ))}
        </MenuPopup>
      </Menu>
    </div>
  );
}
