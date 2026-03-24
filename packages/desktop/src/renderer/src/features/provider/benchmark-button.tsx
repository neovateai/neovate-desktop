import { ChevronDown, Gauge, Square, Zap } from "lucide-react";
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
  const quickCheckAll = useProviderStore((s) => s.quickCheckAll);
  const benchmarkAll = useProviderStore((s) => s.benchmarkAll);
  const cancelTests = useProviderStore((s) => s.cancelTests);
  const testingModels = useProviderStore((s) => s.testingModels);
  const [running, setRunning] = useState(false);

  const modelIds = Object.keys(models);
  const isAnyRunning = running || modelIds.some((id) => testingModels[`${baseURL}:${id}`]);

  const showLabel = size !== "icon" && size !== "icon-sm" && size !== "icon-xs";

  const runAction = useCallback(
    async (action: () => Promise<void>) => {
      if (isAnyRunning) {
        cancelTests();
        setRunning(false);
        return;
      }
      if (modelIds.length === 0) return;
      setRunning(true);
      try {
        await action();
        onComplete?.();
      } catch (e) {
        if (!(e instanceof DOMException && e.name === "AbortError")) {
          console.error("Test failed:", e);
        }
      } finally {
        setRunning(false);
      }
    },
    [isAnyRunning, modelIds, cancelTests, onComplete],
  );

  const handleQuickTest = useCallback(
    () => runAction(() => quickCheckAll(baseURL, apiKey, modelIds)),
    [runAction, quickCheckAll, baseURL, apiKey, modelIds],
  );

  const handleBenchmark = useCallback(
    () => runAction(() => benchmarkAll(baseURL, apiKey, modelIds)),
    [runAction, benchmarkAll, baseURL, apiKey, modelIds],
  );

  const handleQuickTestSingle = useCallback(
    (modelId: string) => runAction(() => quickCheckAll(baseURL, apiKey, [modelId])),
    [runAction, quickCheckAll, baseURL, apiKey],
  );

  if (isAnyRunning) {
    return (
      <Button
        variant="destructive-outline"
        size={size}
        className={className}
        onClick={handleQuickTest}
        aria-label={t("settings.providers.benchmark.cancel")}
      >
        <Square className="h-3 w-3" />
        {showLabel && <span>{t("settings.providers.benchmark.cancel")}</span>}
      </Button>
    );
  }

  return (
    <div className="inline-flex">
      <Button
        variant={variant}
        size={size}
        className={`${className ?? ""} rounded-r-none border-r-0`}
        disabled={disabled || modelIds.length === 0}
        onClick={handleQuickTest}
        aria-label={t("settings.providers.benchmark.quickTest")}
      >
        <Zap className="h-3.5 w-3.5" />
        {showLabel && <span>{t("settings.providers.benchmark.test")}</span>}
      </Button>
      <Menu>
        <MenuTrigger
          className={`inline-flex items-center justify-center rounded-l-none border border-input bg-popover px-1 text-foreground shadow-xs/5 hover:bg-accent/50 disabled:pointer-events-none disabled:opacity-64 ${size === "xs" ? "h-7 sm:h-6" : size === "sm" ? "h-8 sm:h-7" : "h-9 sm:h-8"}`}
          disabled={disabled || modelIds.length === 0}
        >
          <ChevronDown className="h-3 w-3" />
        </MenuTrigger>
        <MenuPopup align="end" side="bottom" sideOffset={4}>
          <MenuItem onClick={handleBenchmark}>
            <Gauge className="h-3.5 w-3.5" />
            <span className="text-xs">{t("settings.providers.benchmark.fullBenchmark")}</span>
          </MenuItem>
          {modelIds.map((id) => (
            <MenuItem key={id} onClick={() => handleQuickTestSingle(id)}>
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
