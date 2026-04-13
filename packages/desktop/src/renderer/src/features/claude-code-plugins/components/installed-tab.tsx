import debug from "debug";
import { ArrowUpCircle, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  InstalledPlugin,
  PluginUpdate,
} from "../../../../../shared/features/claude-code-plugins/types";
import type { Project } from "../../../../../shared/features/project/types";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Spinner } from "../../../components/ui/spinner";
import { Switch } from "../../../components/ui/switch";
import { client } from "../../../orpc";
import { PluginDetailModal } from "./plugin-detail-modal";

const log = debug("neovate:plugins");

const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface InstalledTabProps {
  plugins: InstalledPlugin[];
  updates: PluginUpdate[];
  projects: Project[];
  onRefresh: () => Promise<void>;
}

export const InstalledTab = ({ plugins, updates, projects, onRefresh }: InstalledTabProps) => {
  const { t } = useTranslation();
  const [selectedPlugin, setSelectedPlugin] = useState<InstalledPlugin | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [updatingAll, setUpdatingAll] = useState(false);

  const getUpdate = (plugin: InstalledPlugin) =>
    updates.find((u) => u.pluginId === plugin.pluginId && u.scope === plugin.scope);

  const handleToggle = async (plugin: InstalledPlugin) => {
    const key = `${plugin.pluginId}-${plugin.scope}`;
    if (togglingId) return;
    setTogglingId(key);
    log("toggle plugin: %s enabled=%s", plugin.pluginId, !plugin.enabled);
    try {
      if (plugin.enabled) {
        await client.plugins.disable({ pluginId: plugin.pluginId });
      } else {
        await client.plugins.enable({ pluginId: plugin.pluginId });
      }
      await onRefresh();
    } finally {
      setTogglingId(null);
    }
  };

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    try {
      await client.plugins.updateAll({});
      await onRefresh();
    } finally {
      setUpdatingAll(false);
    }
  };

  if (plugins.length === 0) {
    return (
      <div className="rounded-xl bg-card/60 border border-border/30 py-8">
        <p className="text-sm text-muted-foreground text-center">
          {t("settings.plugins.noPluginsInstalled")}
        </p>
      </div>
    );
  }

  return (
    <>
      {updates.length > 0 && (
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-muted-foreground">
            {t("settings.plugins.updatesAvailable", { count: updates.length })}
          </span>
          <Button variant="outline" size="sm" onClick={handleUpdateAll} disabled={updatingAll}>
            {updatingAll ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
            {t("settings.plugins.updateAll")}
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {plugins.map((plugin) => {
          const key = `${plugin.pluginId}-${plugin.scope}`;
          const initials = getInitials(plugin.name);
          const update = getUpdate(plugin);
          return (
            <div
              key={key}
              className="group relative flex gap-3 p-3.5 rounded-xl bg-card/80 border border-border/40 cursor-pointer hover:bg-card hover:border-border/60 hover:shadow-sm transition-colors duration-200"
              onClick={() => setSelectedPlugin(plugin)}
            >
              <div className="flex items-center justify-center size-10 rounded-lg bg-muted text-muted-foreground text-sm font-semibold shrink-0 self-center">
                {initials}
              </div>

              <div className="flex-1 min-w-0 py-0.5">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-sm font-medium text-foreground truncate">{plugin.name}</h3>
                  {update && (
                    <Badge variant="default" size="sm" className="gap-0.5 shrink-0">
                      <ArrowUpCircle className="size-3" />
                      {t("settings.plugins.update")}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {plugin.description || t("settings.plugins.noDescription")}
                </p>
              </div>

              <div className="shrink-0 self-center" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={plugin.enabled}
                  disabled={togglingId !== null}
                  onCheckedChange={() => handleToggle(plugin)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {selectedPlugin && (
        <PluginDetailModal
          installedPlugin={
            plugins.find(
              (p) => p.pluginId === selectedPlugin.pluginId && p.scope === selectedPlugin.scope,
            ) ?? selectedPlugin
          }
          update={getUpdate(selectedPlugin)}
          projects={projects}
          onClose={() => setSelectedPlugin(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
