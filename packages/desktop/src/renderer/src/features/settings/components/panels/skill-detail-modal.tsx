import debug from "debug";
import { ArrowUpCircle, FolderOpen, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Project } from "../../../../../../shared/features/project/types";
import type {
  RecommendedSkill,
  SkillMeta,
  SkillUpdate,
} from "../../../../../../shared/features/skills/types";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../../../components/ui/dialog";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Spinner } from "../../../../components/ui/spinner";
import { Switch } from "../../../../components/ui/switch";
import { client } from "../../../../orpc";

const log = debug("neovate:settings:skills");

interface SkillDetailModalProps {
  skill?: SkillMeta;
  update?: SkillUpdate;
  recommendedSkill?: RecommendedSkill;
  projects?: Project[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onInstall?: (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => Promise<void>;
}

export const SkillDetailModal = ({
  skill,
  update,
  recommendedSkill,
  projects = [],
  onClose,
  onRefresh,
  onInstall,
}: SkillDetailModalProps) => {
  const { t } = useTranslation();
  const isInstalled = !!skill;
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [installScope, setInstallScope] = useState<string>("global");

  // Fetch SKILL.md content for installed skills
  useEffect(() => {
    if (!skill) return;
    setLoadingContent(true);
    client.skills
      .getContent({ name: skill.name, scope: skill.scope, projectPath: skill.projectPath })
      .then(setContent)
      .catch(() => setContent(null))
      .finally(() => setLoadingContent(false));
  }, [skill]);

  const handleToggle = async () => {
    if (!skill || toggling) return;
    setToggling(true);
    try {
      if (skill.enabled) {
        await client.skills.disable({
          name: skill.name,
          scope: skill.scope,
          projectPath: skill.projectPath,
        });
      } else {
        await client.skills.enable({
          name: skill.name,
          scope: skill.scope,
          projectPath: skill.projectPath,
        });
      }
      await onRefresh();
    } catch {
      // Silently fail
    } finally {
      setToggling(false);
    }
  };

  const handleRemove = async () => {
    if (!skill) return;
    log("removing skill: name=%s scope=%s", skill.name, skill.scope);
    setRemoving(true);
    try {
      await client.skills.remove({
        name: skill.name,
        scope: skill.scope,
        projectPath: skill.projectPath,
      });
      await onRefresh();
      onClose();
    } finally {
      setRemoving(false);
    }
  };

  const handleOpenFolder = () => {
    if (!skill) return;
    client.skills.openFolder({
      name: skill.name,
      scope: skill.scope,
      projectPath: skill.projectPath,
    });
  };

  const handleUpdate = async () => {
    if (!skill) return;
    log("updating skill: name=%s scope=%s", skill.name, skill.scope);
    setUpdating(true);
    try {
      await client.skills.update({
        name: skill.name,
        scope: skill.scope,
        projectPath: skill.projectPath,
      });
      await onRefresh();
      onClose();
    } finally {
      setUpdating(false);
    }
  };

  const handleInstall = async () => {
    if (!recommendedSkill || !onInstall) return;
    log("installing recommended skill: name=%s scope=%s", recommendedSkill.name, installScope);
    setInstalling(true);
    try {
      const scope = installScope === "global" ? "global" : "project";
      const projectPath = installScope === "global" ? undefined : installScope;
      await onInstall(recommendedSkill, scope as "global" | "project", projectPath);
      onClose();
    } finally {
      setInstalling(false);
    }
  };

  const displayName = skill?.name ?? recommendedSkill?.name ?? "";
  const description = skill?.description ?? recommendedSkill?.description ?? "";
  const fm = skill?.frontmatter;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogPopup className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{displayName}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {isInstalled && (
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {skill.enabled
                  ? t("settings.skills.detail.enabled")
                  : t("settings.skills.detail.disabled")}
              </span>
              <Switch checked={skill.enabled} disabled={toggling} onCheckedChange={handleToggle} />
            </div>
          )}
          {isInstalled && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" size="sm">
                {skill.scope === "global"
                  ? t("settings.skills.scopeGlobal")
                  : (skill.projectPath?.split("/").pop() ?? t("settings.skills.scopeProject"))}
              </Badge>
              {skill.version && (
                <Badge variant="secondary" size="sm">
                  v{skill.version}
                </Badge>
              )}
              {update && (
                <Badge variant="default" size="sm" className="gap-1">
                  <ArrowUpCircle className="size-3" />
                  {update.latestVersion}
                </Badge>
              )}
              {skill.installedFrom && (
                <span className="text-xs text-muted-foreground">
                  {t("settings.skills.detail.source", { source: skill.installedFrom })}
                </span>
              )}
            </div>
          )}
          {!isInstalled && recommendedSkill && (
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" size="sm">
                {recommendedSkill.source}
              </Badge>
              {recommendedSkill.version && (
                <Badge variant="secondary" size="sm">
                  v{recommendedSkill.version}
                </Badge>
              )}
            </div>
          )}
        </DialogHeader>

        <DialogPanel>
          {/* Frontmatter metadata */}
          {isInstalled && fm && (
            <div className="mb-4 space-y-1 text-xs text-muted-foreground">
              {fm.disableModelInvocation !== undefined && (
                <div>
                  {t("settings.skills.detail.modelInvocation", {
                    status: fm.disableModelInvocation
                      ? t("settings.skills.detail.disabled")
                      : t("settings.skills.detail.enabled"),
                  })}
                </div>
              )}
              {fm.userInvocable !== undefined && (
                <div>
                  {t("settings.skills.detail.userInvocable", {
                    status: fm.userInvocable ? t("common.yes") : t("common.no"),
                  })}
                </div>
              )}
              {fm.allowedTools && fm.allowedTools.length > 0 && (
                <div>
                  {t("settings.skills.detail.allowedTools", { tools: fm.allowedTools.join(", ") })}
                </div>
              )}
              {fm.context && (
                <div>{t("settings.skills.detail.context", { value: fm.context })}</div>
              )}
              {fm.model && <div>{t("settings.skills.detail.model", { value: fm.model })}</div>}
              {fm.argumentHint && (
                <div>{t("settings.skills.detail.arguments", { value: fm.argumentHint })}</div>
              )}
            </div>
          )}

          {/* SKILL.md content */}
          {loadingContent ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Spinner className="size-4" />
              <span className="text-sm">{t("settings.skills.detail.loadingContent")}</span>
            </div>
          ) : content ? (
            <div className="rounded-md bg-muted border border-border p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{content}</pre>
            </div>
          ) : null}

          {/* Path for installed skills */}
          {isInstalled && (
            <div className="mt-3 text-xs text-muted-foreground break-all">
              {t("settings.skills.detail.path", { path: skill.dirPath })}
            </div>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          {isInstalled ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                  <FolderOpen className="size-3.5" />
                  {t("settings.skills.detail.openFolder")}
                </Button>
                {update && (
                  <Button variant="default" size="sm" onClick={handleUpdate} disabled={updating}>
                    {updating ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <ArrowUpCircle className="size-3.5" />
                    )}
                    {updating
                      ? t("settings.skills.detail.updating")
                      : t("settings.skills.detail.update")}
                  </Button>
                )}
              </div>
              {confirmRemove ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">
                    {t("settings.skills.detail.deleteConfirm")}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemove}
                    disabled={removing}
                  >
                    {removing ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
                    {t("settings.skills.detail.remove")}
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
                  {t("settings.skills.detail.uninstall")}
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 w-full">
              <Select value={installScope} onValueChange={(v) => v && setInstallScope(v)}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue>
                    {installScope === "global"
                      ? t("settings.skills.scopeGlobal")
                      : (projects.find((p) => p.path === installScope)?.name ?? installScope)}
                  </SelectValue>
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="global">{t("settings.skills.scopeGlobal")}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.path}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Button variant="default" size="sm" onClick={handleInstall} disabled={installing}>
                {installing ? <Spinner className="size-3.5" /> : null}
                {installing ? t("settings.skills.installing") : t("settings.skills.install")}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
