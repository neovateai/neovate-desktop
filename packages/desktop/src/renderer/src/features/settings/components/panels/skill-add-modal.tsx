import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Project } from "../../../../../../shared/features/project/types";
import type { PreviewSkill } from "../../../../../../shared/features/skills/types";

import { Button } from "../../../../components/ui/button";
import { Checkbox } from "../../../../components/ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../../../../components/ui/dialog";
import { Input } from "../../../../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Spinner } from "../../../../components/ui/spinner";
import { cn } from "../../../../lib/utils";
import { client } from "../../../../orpc";

type AddPhase =
  | { step: "input"; error?: string }
  | { step: "fetching"; source: string }
  | {
      step: "select";
      previewId: string;
      source: string;
      skills: PreviewSkill[];
      selected: Set<string>;
    }
  | { step: "installing" };

interface SkillAddModalProps {
  projects: Project[];
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export const SkillAddModal = ({ projects, onClose, onRefresh }: SkillAddModalProps) => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<AddPhase>({ step: "input" });
  const [sourceInput, setSourceInput] = useState("");
  const [installScope, setInstallScope] = useState<string>("global");

  const handleFetch = async () => {
    const source = sourceInput.trim();
    if (!source) return;

    setPhase({ step: "fetching", source });
    try {
      const result = await client.skills.preview({ source });
      if (result.skills.length === 0) {
        setPhase({ step: "input", error: t("settings.skills.noSkillsFound") });
        return;
      }
      setPhase({
        step: "select",
        previewId: result.previewId,
        source,
        skills: result.skills,
        selected: new Set(result.skills.map((s) => s.name)),
      });
    } catch (e: any) {
      setPhase({ step: "input", error: e.message || t("settings.skills.fetchFailed") });
    }
  };

  const handleCancel = async () => {
    if (phase.step === "fetching" || phase.step === "select") {
      if ("previewId" in phase) {
        client.skills.cancelPreview({ previewId: phase.previewId }).catch(() => {});
      }
    }
    onClose();
  };

  const toggleSkill = (name: string) => {
    if (phase.step !== "select") return;
    const next = new Set(phase.selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setPhase({ ...phase, selected: next });
  };

  const handleInstall = async () => {
    if (phase.step !== "select") return;
    const { previewId, selected } = phase;
    if (selected.size === 0) return;

    setPhase({ step: "installing" });
    try {
      const scope = installScope === "global" ? "global" : "project";
      const projectPath = installScope === "global" ? undefined : installScope;
      await client.skills.installFromPreview({
        previewId,
        selectedSkills: Array.from(selected),
        scope: scope as "global" | "project",
        projectPath,
      });
      await onRefresh();
      onClose();
    } catch (e: any) {
      setPhase({ step: "input", error: e.message || t("settings.skills.installFailed") });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && handleCancel()}>
      <DialogPopup className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("settings.skills.addSkill")}</DialogTitle>
          <DialogDescription>{t("settings.skills.addDescription")}</DialogDescription>
        </DialogHeader>

        <DialogPanel>
          {/* Step 1: Input */}
          {phase.step === "input" && (
            <div className="space-y-3">
              <Input
                value={sourceInput}
                onChange={(e) => setSourceInput(e.target.value)}
                placeholder={t("settings.skills.sourcePlaceholder")}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && sourceInput.trim()) handleFetch();
                }}
                autoFocus
              />
              <div className="text-xs text-muted-foreground space-y-1">
                <div>{t("settings.skills.examples")}</div>
                <div className="pl-2">github.com/user/claude-skills</div>
                <div className="pl-2">npm:@claude-skills/pr-apply</div>
                <div className="pl-2">/path/to/local/skill</div>
              </div>
              {phase.error && <p className="text-sm text-destructive">{phase.error}</p>}
            </div>
          )}

          {/* Step 1.5: Fetching */}
          {phase.step === "fetching" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Spinner className="size-6" />
              <div className="text-sm text-muted-foreground">
                {t("settings.skills.fetchingFromSource")}
              </div>
              <div className="text-xs text-muted-foreground truncate max-w-full">
                {phase.source}
              </div>
            </div>
          )}

          {/* Step 2: Select */}
          {phase.step === "select" && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                {t("settings.skills.foundSkills", { count: phase.skills.length })}
              </div>
              <div className="space-y-1">
                {phase.skills.map((skill) => {
                  const isSelected = phase.selected.has(skill.name);
                  return (
                    <label
                      key={skill.skillPath}
                      className={cn(
                        "flex items-start gap-3 p-2 rounded-md cursor-pointer transition-colors",
                        isSelected ? "bg-accent" : "bg-transparent hover:bg-accent/50",
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleSkill(skill.name)}
                      />
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-foreground">{skill.name}</span>
                        {skill.description && (
                          <p className="text-xs text-muted-foreground">{skill.description}</p>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <span className="text-xs text-muted-foreground">
                  {t("settings.skills.installTo")}
                </span>
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
              </div>
            </div>
          )}

          {/* Step 3: Installing */}
          {phase.step === "installing" && (
            <div className="flex flex-col items-center gap-3 py-6">
              <Spinner className="size-6" />
              <div className="text-sm text-muted-foreground">{t("settings.skills.installing")}</div>
            </div>
          )}
        </DialogPanel>

        <DialogFooter variant="bare">
          {phase.step === "input" && (
            <div className="flex justify-end gap-2 w-full">
              <Button variant="outline" size="sm" onClick={onClose}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleFetch}
                disabled={!sourceInput.trim()}
              >
                {t("settings.skills.next")}
              </Button>
            </div>
          )}

          {phase.step === "fetching" && (
            <div className="flex justify-end w-full">
              <Button variant="outline" size="sm" onClick={handleCancel}>
                {t("common.cancel")}
              </Button>
            </div>
          )}

          {phase.step === "select" && (
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-muted-foreground">
                {t("settings.skills.selectedCount", {
                  selected: phase.selected.size,
                  total: phase.skills.length,
                })}
              </span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCancel}>
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleInstall}
                  disabled={phase.selected.size === 0}
                >
                  {t("settings.skills.installCount", { count: phase.selected.size })}
                </Button>
              </div>
            </div>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
};
