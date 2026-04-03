import debug from "debug";
import { Plus, RefreshCw, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Marketplace } from "../../../../../shared/features/claude-code-plugins/types";

import { Button } from "../../../components/ui/button";
import { Spinner } from "../../../components/ui/spinner";
import { client } from "../../../orpc";
import { AddMarketplaceModal } from "./add-marketplace-modal";

const log = debug("neovate:plugins");

interface SourcesTabProps {
  marketplaces: Marketplace[];
  onBrowse: (name: string) => void;
  onRefresh: () => Promise<void>;
}

export const SourcesTab = ({ marketplaces, onBrowse, onRefresh }: SourcesTabProps) => {
  const { t } = useTranslation();
  const [showAddModal, setShowAddModal] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const handleRefresh = async (name: string) => {
    setRefreshingId(name);
    log("refreshing marketplace %s", name);
    try {
      await client.plugins.updateMarketplace({ name });
      await onRefresh();
    } finally {
      setRefreshingId(null);
    }
  };

  const handleRemove = async (name: string) => {
    setRemovingId(name);
    log("removing marketplace %s", name);
    try {
      await client.plugins.removeMarketplace({ name });
      await onRefresh();
    } finally {
      setRemovingId(null);
      setConfirmRemove(null);
    }
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return t("settings.plugins.updatedNever");
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return t("settings.plugins.updatedToday");
    if (diffDays === 1) return t("settings.plugins.updatedYesterday");
    if (diffDays < 30) return t("settings.plugins.updatedDaysAgo", { count: diffDays });
    return date.toLocaleDateString();
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">
          {t("settings.plugins.sourcesCount", { count: marketplaces.length })}
        </span>
        <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="size-3.5" />
          {t("settings.plugins.addSource")}
        </Button>
      </div>

      {marketplaces.length === 0 ? (
        <div className="rounded-lg bg-muted/20 py-12 px-6 text-center">
          <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 mx-auto mb-4">
            <Store className="size-6 text-primary" />
          </div>
          <h3 className="text-sm font-medium text-foreground mb-2">No sources configured</h3>
          <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
            {t("settings.plugins.noSourcesConfigured")}
          </p>
          <Button variant="default" size="sm" onClick={() => setShowAddModal(true)}>
            <Plus className="size-3.5" />
            Add Source
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {marketplaces.map((mp) => (
            <div
              key={mp.name}
              className="group flex items-center justify-between p-4 rounded-xl bg-card/80 border border-border/40 hover:bg-card hover:border-border/60 transition-colors duration-200 cursor-pointer"
              onClick={() => onBrowse(mp.name)}
            >
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-medium text-foreground truncate">{mp.name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {mp.source.source} · {mp.pluginCount} plugin{mp.pluginCount !== 1 ? "s" : ""} ·{" "}
                  {formatDate(mp.lastUpdated)}
                </p>
              </div>

              <div
                className="flex items-center gap-1 ml-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRefresh(mp.name)}
                  disabled={refreshingId !== null}
                >
                  {refreshingId === mp.name ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <RefreshCw className="size-3.5" />
                  )}
                </Button>
                {confirmRemove === mp.name ? (
                  <div className="flex items-center gap-1">
                    <Button variant="outline" size="sm" onClick={() => setConfirmRemove(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleRemove(mp.name)}
                      disabled={removingId !== null}
                    >
                      {removingId === mp.name ? (
                        <Spinner className="size-3.5" />
                      ) : (
                        t("settings.plugins.remove")
                      )}
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => setConfirmRemove(mp.name)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAddModal && (
        <AddMarketplaceModal onClose={() => setShowAddModal(false)} onRefresh={onRefresh} />
      )}
    </>
  );
};
