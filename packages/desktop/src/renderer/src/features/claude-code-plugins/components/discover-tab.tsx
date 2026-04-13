import { Download, Plus, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  Marketplace,
  MarketplacePlugin,
} from "../../../../../shared/features/claude-code-plugins/types";
import type { Project } from "../../../../../shared/features/project/types";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import { Spinner } from "../../../components/ui/spinner";
import { toastManager } from "../../../components/ui/toast";
import { client } from "../../../orpc";
import { PluginDetailModal } from "./plugin-detail-modal";

const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface DiscoverTabProps {
  plugins: MarketplacePlugin[];
  marketplaces: Marketplace[];
  projects: Project[];
  sourceFilter: string | null;
  onClearSourceFilter: () => void;
  onRefresh: () => Promise<void>;
}

export const DiscoverTab = ({
  plugins,
  marketplaces,
  projects,
  sourceFilter,
  onClearSourceFilter,
  onRefresh,
}: DiscoverTabProps) => {
  const { t } = useTranslation();
  const [selectedPlugin, setSelectedPlugin] = useState<MarketplacePlugin | null>(null);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [addingOfficial, setAddingOfficial] = useState(false);

  const handleQuickInstall = async (plugin: MarketplacePlugin) => {
    const key = `${plugin.name}@${plugin.marketplace}`;
    if (installingId) return;
    setInstallingId(key);
    try {
      await client.plugins.install({
        pluginName: plugin.name,
        marketplace: plugin.marketplace,
        scope: "user",
      });
      await onRefresh();
    } catch {
      // Error handled by onRefresh
    } finally {
      setInstallingId(null);
    }
  };

  const handleAddOfficial = async () => {
    if (addingOfficial) return;
    setAddingOfficial(true);
    try {
      await client.plugins.addMarketplace({ source: "anthropics/claude-plugins-official" });
      await onRefresh();
    } catch (e: any) {
      toastManager.add({
        type: "error",
        title: t("settings.plugins.officialMarketplaceError"),
        description: e.message,
      });
    } finally {
      setAddingOfficial(false);
    }
  };

  if (marketplaces.length === 0) {
    return (
      <div className="rounded-xl bg-card/60 border border-border/30 py-12 px-6 text-center">
        <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 mx-auto mb-4">
          <Download className="size-6 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-2">
          {t("settings.plugins.noSources")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
          {t("settings.plugins.noSourcesDescription")}
        </p>
        <Button variant="default" size="sm" onClick={handleAddOfficial} disabled={addingOfficial}>
          {addingOfficial ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
          {t("settings.plugins.addOfficialMarketplace")}
        </Button>
      </div>
    );
  }

  if (plugins.length === 0) {
    return (
      <div className="rounded-xl bg-card/60 border border-border/30 py-8">
        <p className="text-sm text-muted-foreground text-center">
          {t("settings.plugins.noPluginsFound")}
        </p>
      </div>
    );
  }

  return (
    <>
      {sourceFilter && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-muted-foreground">{t("settings.plugins.source")}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground hover:bg-muted/80 transition-colors"
            onClick={onClearSourceFilter}
          >
            {sourceFilter}
            <X className="size-3" />
          </button>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        {plugins.map((plugin) => {
          const key = `${plugin.name}@${plugin.marketplace}`;
          const initials = getInitials(plugin.name);
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
                  {plugin.category && (
                    <Badge variant="secondary" size="sm" className="shrink-0">
                      {plugin.category}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                  {plugin.description || t("settings.plugins.noDescription")}
                </p>
              </div>

              <div className="shrink-0 self-center h-7 flex items-center">
                {plugin.installedScopes.length > 0 ? (
                  <Badge variant="secondary" size="sm">
                    {t("settings.plugins.installedBadge")}
                  </Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                    disabled={installingId !== null}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleQuickInstall(plugin);
                    }}
                  >
                    {installingId === key ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedPlugin && (
        <PluginDetailModal
          marketplacePlugin={selectedPlugin}
          projects={projects}
          onClose={() => setSelectedPlugin(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
