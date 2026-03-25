import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";

import type { ThemeStyle } from "../../../../../shared/features/config/types";

import { cn } from "../../../lib/utils";

const THEME_STYLES = [
  { value: "default" as const, labelKey: "settings.themeStyle.default" as const },
  { value: "claude" as const, labelKey: "settings.themeStyle.claude" as const },
  { value: "codex" as const, labelKey: "settings.themeStyle.codex" as const },
  { value: "nord" as const, labelKey: "settings.themeStyle.nord" as const },
];

interface ThemeStylePickerProps {
  value: ThemeStyle;
  onChange: (style: ThemeStyle) => void;
}

export function ThemeStylePicker({ value, onChange }: ThemeStylePickerProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div className="flex gap-3">
      {THEME_STYLES.map((style) => {
        const isSelected = value === style.value;

        return (
          <button
            key={style.value}
            type="button"
            onClick={() => onChange(style.value)}
            className={cn(
              "group relative flex flex-col overflow-hidden rounded-lg border-2 transition-all",
              "w-[72px] hover:scale-105 hover:shadow-md",
              isSelected
                ? "border-primary ring-2 ring-primary/20"
                : "border-border hover:border-muted-foreground/30",
            )}
          >
            {/* Color preview — data-style scopes CSS vars so each swatch shows its own palette */}
            <div
              data-style={style.value}
              className={cn("relative h-12 w-full", isDark && "dark")}
              style={{ backgroundColor: "var(--background)" }}
            >
              {/* Sidebar strip */}
              <div
                className="absolute left-0 top-0 h-full w-3"
                style={{ backgroundColor: "var(--sidebar)" }}
              />
              {/* Primary accent circle */}
              <div
                className="absolute right-2 top-1/2 -translate-y-1/2 size-4 rounded-full"
                style={{ backgroundColor: "var(--primary)" }}
              />
            </div>

            {/* Label area */}
            <div
              className={cn(
                "flex items-center justify-center gap-1 px-1 py-1.5",
                "text-xs font-medium",
                isSelected ? "bg-primary/10 text-primary" : "bg-muted/50 text-muted-foreground",
              )}
            >
              <span className="truncate">{t(style.labelKey)}</span>
              {isSelected && (
                <span className="size-1.5 rounded-full bg-primary shrink-0" aria-hidden="true" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
