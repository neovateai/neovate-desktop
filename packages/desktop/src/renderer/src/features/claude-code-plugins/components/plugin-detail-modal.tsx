import debug from "debug";
import { AlertTriangle, ArrowUpCircle, Check, ExternalLink, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  InstalledPlugin,
  MarketplacePlugin,
  PluginUpdate,
} from "../../../../../shared/features/claude-code-plugins/types";
import type { Project } from "../../../../../shared/features/project/types";

import { Badge } from "../../../components/ui/badge";
import { Button } from "../../../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../../components/ui/dialog";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Spinner } from "../../../components/ui/spinner";
import { Switch } from "../../../components/ui/switch";
import { client } from "../../../orpc";

const log = debug("neovate:plugins");

interface PluginDetailModalProps {
  installedPlugin?: InstalledPlugin;
  marketplacePlugin?: MarketplacePlugin;
  update?: PluginUpdate;
  projects: Project[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const PluginDetailModal = ({
  installedPlugin,
  marketplacePlugin,
  update,
  projects,
  onClose,
  onRefresh,
}: PluginDetailModalProps) => {
  const { t } = useTranslation();
  const isInstalled = !!installedPlugin;
  const [readme, setReadme] = useState<string | null>(null);
  const [loadingReadme, setLoadingReadme] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [installTarget, setInstallTarget] = useState<string>("user");
  const [projectScope, setProjectScope] = useState<"project" | "local">("project");

  const selectedScope = installTarget === "user" ? "user" : projectScope;
  const selectedProjectPath = installTarget === "user" ? undefined : installTarget;

  const isAlreadyInstalled = useMemo(() => {
    if (!marketplacePlugin) return false;
    return marketplacePlugin.installedScopes.some(
      (s) => s.scope === selectedScope && s.projectPath === selectedProjectPath,
    );
  }, [marketplacePlugin, selectedScope, selectedProjectPath]);

  const installedScopeLabels = useMemo(() => {
    if (!marketplacePlugin) return [];
    return marketplacePlugin.installedScopes.map((s) => {
      if (s.scope === "user") return t("settings.plugins.userGlobal");
      const projectName =
        projects.find((p) => p.path === s.projectPath)?.name ??
        s.projectPath?.split("/").pop() ??
        t("settings.plugins.unknown");
      return `${projectName} (${s.scope === "project" ? t("settings.plugins.shared").toLowerCase() : t("settings.plugins.localOnly").toLowerCase()})`;
    });
  }, [marketplacePlugin, projects, t]);

  useEffect(() => {
    if (!installedPlugin) return;
    setLoadingReadme(true);
    client.plugins
      .getReadme({
        pluginId: installedPlugin.pluginId,
        scope: installedPlugin.scope,
        projectPath: installedPlugin.projectPath,
      })
      .then(setReadme)
      .catch(() => setReadme(null))
      .finally(() => setLoadingReadme(false));
  }, [installedPlugin]);

  const handleToggle = async () => {
    if (!installedPlugin || toggling) return;
    setToggling(true);
    try {
      if (installedPlugin.enabled) {
        await client.plugins.disable({ pluginId: installedPlugin.pluginId });
      } else {
        await client.plugins.enable({ pluginId: installedPlugin.pluginId });
      }
      await onRefresh();
    } finally {
      setToggling(false);
    }
  };

  const handleUninstall = async () => {
    if (!installedPlugin) return;
    log("uninstalling plugin: %s", installedPlugin.pluginId);
    setRemoving(true);
    try {
      await client.plugins.uninstall({
        pluginId: installedPlugin.pluginId,
        scope: installedPlugin.scope,
        projectPath: installedPlugin.projectPath,
      });
      await onRefresh();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  const handleUpdate = async () => {
    if (!installedPlugin) return;
    log("updating plugin: %s", installedPlugin.pluginId);
    setUpdating(true);
    try {
      await client.plugins.update({
        pluginId: installedPlugin.pluginId,
        scope: installedPlugin.scope,
        projectPath: installedPlugin.projectPath,
      });
      await onRefresh();
      onClose();
    } finally {
      setUpdating(false);
    }
  };

  const handleInstall = async () => {
    if (!marketplacePlugin || isAlreadyInstalled) return;
    log(
      "installing plugin: %s scope=%s projectPath=%s",
      marketplacePlugin.name,
      selectedScope,
      selectedProjectPath,
    );
    setInstalling(true);
    try {
      await client.plugins.install({
        pluginName: marketplacePlugin.name,
        marketplace: marketplacePlugin.marketplace,
        scope: selectedScope,
        projectPath: selectedProjectPath,
      });
      await onRefresh();
      onClose();
    } finally {
      setInstalling(false);
    }
  };

  const displayName = installedPlugin?.name ?? marketplacePlugin?.name ?? "";
  const description = installedPlugin?.description ?? marketplacePlugin?.description ?? "";
  const author = installedPlugin?.author ?? marketplacePlugin?.author;
  const homepage = installedPlugin?.homepage ?? marketplacePlugin?.homepage;
  const marketplace = installedPlugin?.marketplace ?? marketplacePlugin?.marketplace;
  const isOfficial = marketplace === "claude-plugins-official";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{displayName}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {author && (
            <p className="text-xs text-muted-foreground mt-1">
              {t("settings.plugins.by", { name: author.name })}
            </p>
          )}
          {isInstalled && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">
                {installedPlugin.enabled
                  ? t("settings.plugins.enabled")
                  : t("settings.plugins.disabled")}
              </span>
              <Switch
                checked={installedPlugin.enabled}
                disabled={toggling}
                onCheckedChange={handleToggle}
              />
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap mt-2">
            {isInstalled && (
              <>
                <Badge variant="outline" size="sm">
                  {installedPlugin.scope === "user"
                    ? "user"
                    : `${installedPlugin.scope}: ${installedPlugin.projectPath?.split("/").pop() ?? "unknown"}`}
                </Badge>
                {installedPlugin.version && (
                  <Badge variant="secondary" size="sm">
                    v{installedPlugin.version}
                  </Badge>
                )}
                {update && (
                  <Badge variant="default" size="sm" className="gap-1">
                    <ArrowUpCircle className="size-3" />
                    {t("settings.plugins.updateAvailable")}
                  </Badge>
                )}
              </>
            )}
            {!isInstalled && marketplacePlugin && (
              <>
                <Badge variant="outline" size="sm">
                  {marketplacePlugin.marketplace}
                </Badge>
                {marketplacePlugin.category && (
                  <Badge variant="secondary" size="sm">
                    {marketplacePlugin.category}
                  </Badge>
                )}
              </>
            )}
          </div>
        </DialogHeader>

        <DialogPanel>
          {/* Components for installed */}
          {isInstalled && (
            <div className="mb-4">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">
                {t("settings.plugins.components")}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {installedPlugin.components.hasCommands && (
                  <Badge size="sm">{t("settings.plugins.commands")}</Badge>
                )}
                {installedPlugin.components.hasSkills && (
                  <Badge size="sm">{t("settings.plugins.skills")}</Badge>
                )}
                {installedPlugin.components.hasAgents && (
                  <Badge size="sm">{t("settings.plugins.agents")}</Badge>
                )}
                {installedPlugin.components.hasHooks && (
                  <Badge size="sm">{t("settings.plugins.hooks")}</Badge>
                )}
                {installedPlugin.components.hasMcpServers && (
                  <Badge size="sm">{t("settings.plugins.mcpServers")}</Badge>
                )}
                {installedPlugin.components.hasLspServers && (
                  <Badge size="sm">{t("settings.plugins.lspServers")}</Badge>
                )}
                {!Object.values(installedPlugin.components).some(Boolean) && (
                  <span className="text-xs text-muted-foreground">
                    {t("settings.plugins.noneDetected")}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="space-y-1 text-xs text-muted-foreground mb-4">
            {marketplace && (
              <div>
                {t("settings.plugins.source")} {marketplace}
              </div>
            )}
            {homepage && (
              <div className="flex items-center gap-1">
                {t("settings.plugins.homepage")}{" "}
                <a
                  href={homepage}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-0.5"
                >
                  {homepage.replace(/^https?:\/\//, "").slice(0, 50)}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}
            {installedPlugin?.license && (
              <div>
                {t("settings.plugins.license")} {installedPlugin.license}
              </div>
            )}
          </div>

          {/* README */}
          {loadingReadme ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Spinner className="size-4" />
              <span className="text-sm">{t("settings.plugins.loadingReadme")}</span>
            </div>
          ) : readme ? (
            <div className="rounded-md bg-muted border border-border p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{readme}</pre>
            </div>
          ) : null}

          {/* Trust warning for install */}
          {!isInstalled && (
            <div className="flex items-start gap-2 mt-4 p-3 rounded-md bg-amber-500/10 border border-amber-500/20">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {isOfficial
                  ? t("settings.plugins.trustWarningOfficial")
                  : t("settings.plugins.trustWarningThirdParty")}
              </p>
            </div>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          {isInstalled ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {update && (
                  <Button variant="default" size="sm" onClick={handleUpdate} disabled={updating}>
                    {updating ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <ArrowUpCircle className="size-3.5" />
                    )}
                    {updating ? t("settings.plugins.updating") : t("settings.plugins.update")}
                  </Button>
                )}
              </div>
              {confirmRemove ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">
                    {t("settings.plugins.uninstallConfirm", { scope: installedPlugin.scope })}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleUninstall}
                    disabled={removing}
                  >
                    {removing ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
                    {t("settings.plugins.uninstall")}
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setConfirmRemove(true)}
                  className="text-destructive"
                >
                  <Trash2 className="size-3.5" />
                  {t("settings.plugins.uninstall")}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-2 w-full">
              {installedScopeLabels.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {t("settings.plugins.alreadyInstalled", {
                    scopes: installedScopeLabels.join(", "),
                  })}
                </p>
              )}
              <div className="flex items-center justify-end gap-2">
                <Select value={installTarget} onValueChange={(v) => v && setInstallTarget(v)}>
                  <SelectTrigger size="sm" className="w-36">
                    <SelectValue>
                      {installTarget === "user"
                        ? t("settings.plugins.userGlobal")
                        : (projects.find((p) => p.path === installTarget)?.name ?? installTarget)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    <SelectItem value="user">{t("settings.plugins.userGlobal")}</SelectItem>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.path}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
                {installTarget !== "user" && (
                  <Select
                    value={projectScope}
                    onValueChange={(v) => v && setProjectScope(v as "project" | "local")}
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue>
                        {projectScope === "project"
                          ? t("settings.plugins.shared")
                          : t("settings.plugins.localOnly")}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectPopup>
                      <SelectItem value="project">{t("settings.plugins.shared")}</SelectItem>
                      <SelectItem value="local">{t("settings.plugins.localOnly")}</SelectItem>
                    </SelectPopup>
                  </Select>
                )}
                {isAlreadyInstalled ? (
                  <Button variant="outline" size="sm" disabled>
                    <Check className="size-3.5" />
                    {t("settings.plugins.installedBadge")}
                  </Button>
                ) : (
                  <Button variant="default" size="sm" onClick={handleInstall} disabled={installing}>
                    {installing ? <Spinner className="size-3.5" /> : null}
                    {installing ? t("settings.plugins.installing") : t("settings.plugins.install")}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
