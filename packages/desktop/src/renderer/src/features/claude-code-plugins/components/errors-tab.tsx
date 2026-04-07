import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { PluginError } from "../../../../../shared/features/claude-code-plugins/types";

import { Badge } from "../../../components/ui/badge";

interface ErrorsTabProps {
  errors: PluginError[];
}

export const ErrorsTab = ({ errors }: ErrorsTabProps) => {
  const { t } = useTranslation();

  if (errors.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border/50 py-8">
        <p className="text-sm text-muted-foreground text-center">
          {t("settings.plugins.noErrors")}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {errors.map((error, i) => (
        <div
          key={`${error.type}-${error.timestamp}-${i}`}
          className="flex items-start gap-3 p-4 rounded-xl bg-background border border-destructive/20"
        >
          <AlertTriangle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" size="sm">
                {error.type}
              </Badge>
              {error.pluginId && (
                <span className="text-xs text-muted-foreground">{error.pluginId}</span>
              )}
              {error.marketplace && (
                <span className="text-xs text-muted-foreground">{error.marketplace}</span>
              )}
            </div>
            <p className="text-sm text-foreground">{error.message}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {new Date(error.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
};
