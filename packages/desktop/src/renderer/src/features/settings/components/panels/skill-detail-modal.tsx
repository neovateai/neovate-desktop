import { FolderOpen, Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import type { Project } from "../../../../../../shared/features/project/types";
import type { RecommendedSkill, SkillMeta } from "../../../../../../shared/features/skills/types";

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
import { Switch } from "../../../../components/ui/switch";
import { client } from "../../../../orpc";

interface SkillDetailModalProps {
  skill?: SkillMeta;
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
  recommendedSkill,
  projects = [],
  onClose,
  onRefresh,
  onInstall,
}: SkillDetailModalProps) => {
  const isInstalled = !!skill;
  const [content, setContent] = useState<string | null>(null);
  const [loadingContent, setLoadingContent] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [installing, setInstalling] = useState(false);
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
    if (!skill) return;
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
      onClose();
    } catch {
      // Silently fail
    }
  };

  const handleRemove = async () => {
    if (!skill) return;
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

  const handleInstall = async () => {
    if (!recommendedSkill || !onInstall) return;
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
          <div className="flex items-center justify-between">
            <DialogTitle>{displayName}</DialogTitle>
            {isInstalled && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  {skill.enabled ? "Enabled" : "Disabled"}
                </span>
                <Switch checked={skill.enabled} onCheckedChange={handleToggle} />
              </div>
            )}
          </div>
          <DialogDescription>{description}</DialogDescription>
          {isInstalled && (
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" size="sm">
                {skill.scope === "global"
                  ? "Global"
                  : (skill.projectPath?.split("/").pop() ?? "Project")}
              </Badge>
              {skill.version && (
                <Badge variant="secondary" size="sm">
                  v{skill.version}
                </Badge>
              )}
              {skill.installedFrom && (
                <span className="text-xs text-muted-foreground">Source: {skill.installedFrom}</span>
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
                <div>Model invocation: {fm.disableModelInvocation ? "disabled" : "enabled"}</div>
              )}
              {fm.userInvocable !== undefined && (
                <div>User invocable: {fm.userInvocable ? "yes" : "no"}</div>
              )}
              {fm.allowedTools && fm.allowedTools.length > 0 && (
                <div>Allowed tools: {fm.allowedTools.join(", ")}</div>
              )}
              {fm.context && <div>Context: {fm.context}</div>}
              {fm.model && <div>Model: {fm.model}</div>}
              {fm.argumentHint && <div>Arguments: {fm.argumentHint}</div>}
            </div>
          )}

          {/* SKILL.md content */}
          {loadingContent ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="size-4 animate-spin" />
              <span className="text-sm">Loading content...</span>
            </div>
          ) : content ? (
            <div className="rounded-md bg-muted border border-border p-4 max-h-64 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">{content}</pre>
            </div>
          ) : null}

          {/* Path for installed skills */}
          {isInstalled && (
            <div className="mt-3 text-xs text-muted-foreground truncate">Path: {skill.dirPath}</div>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          {isInstalled ? (
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleOpenFolder}>
                  <FolderOpen className="size-3.5" />
                  Open Folder
                </Button>
              </div>
              {confirmRemove ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-destructive">Delete skill directory?</span>
                  <Button variant="outline" size="sm" onClick={() => setConfirmRemove(false)}>
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleRemove}
                    disabled={removing}
                  >
                    {removing ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                    Remove
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
                  Uninstall
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-end gap-2 w-full">
              <Select value={installScope} onValueChange={(v) => v && setInstallScope(v)}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectPopup>
                  <SelectItem value="global">Global</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.path}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectPopup>
              </Select>
              <Button variant="default" size="sm" onClick={handleInstall} disabled={installing}>
                {installing ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {installing ? "Installing..." : "Install"}
              </Button>
            </div>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
