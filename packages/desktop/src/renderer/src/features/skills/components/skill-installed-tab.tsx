import debug from "debug";
import { ArrowUpCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { Project } from "../../../../../shared/features/project/types";
import type { SkillMeta, SkillUpdate } from "../../../../../shared/features/skills/types";

import { Badge } from "../../../components/ui/badge";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../components/ui/select";
import { Switch } from "../../../components/ui/switch";
import { client } from "../../../orpc";
import { claudeCodeChatManager } from "../../agent/chat-manager";
import { useProjectStore } from "../../project/store";
import { SkillDetailModal } from "./skill-detail-modal";

const log = debug("neovate:settings:skills");

type ScopeFilter = "all" | "global" | string;

const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface SkillInstalledTabProps {
  skills: SkillMeta[];
  updates: SkillUpdate[];
  error: string | null;
  projects: Project[];
  searchQuery: string;
  onRefresh: () => Promise<void>;
}

export const SkillInstalledTab = ({
  skills,
  updates,
  error,
  projects,
  searchQuery,
  onRefresh,
}: SkillInstalledTabProps) => {
  const { t } = useTranslation();
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("global");
  const [selectedSkill, setSelectedSkill] = useState<SkillMeta | null>(null);
  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);

  const filteredSkills = useMemo(() => {
    if (scopeFilter === "all") return skills;
    if (scopeFilter === "global") return skills.filter((s) => s.scope === "global");
    return skills.filter((s) => s.scope === "project" && s.projectPath === scopeFilter);
  }, [skills, scopeFilter]);

  const getUpdate = useCallback(
    (skill: SkillMeta) =>
      updates.find(
        (u) =>
          u.dirName === skill.dirName &&
          u.scope === skill.scope &&
          u.projectPath === skill.projectPath,
      ),
    [updates],
  );

  const handleToggleEnabled = async (skill: SkillMeta) => {
    const key = `${skill.scope}-${skill.projectPath ?? ""}-${skill.dirName}`;
    if (togglingSkill) return;
    setTogglingSkill(key);
    log("toggle skill: dirName=%s enabled=%s", skill.dirName, !skill.enabled);
    try {
      if (skill.enabled) {
        await client.skills.disable({
          dirName: skill.dirName,
          scope: skill.scope,
          projectPath: skill.projectPath,
        });
      } else {
        await client.skills.enable({
          dirName: skill.dirName,
          scope: skill.scope,
          projectPath: skill.projectPath,
        });
      }
      await onRefresh();
      const projectPath = useProjectStore.getState().activeProject?.path;
      claudeCodeChatManager.invalidateNewSessions(projectPath);
    } catch {
      // Silently fail — user can retry
    } finally {
      setTogglingSkill(null);
    }
  };

  const showScopeBadge = scopeFilter === "all";

  if (error) {
    return (
      <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
        {error}
        <button className="ml-2 underline" onClick={() => onRefresh()}>
          {t("settings.skills.retry")}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {t("settings.skills.installed", { count: filteredSkills.length })}
        </h2>
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as ScopeFilter)}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue>
              {scopeFilter === "all"
                ? t("settings.skills.scopeAll")
                : scopeFilter === "global"
                  ? t("settings.skills.scopeGlobal")
                  : (projects.find((p) => p.path === scopeFilter)?.name ?? scopeFilter)}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="all">{t("settings.skills.scopeAll")}</SelectItem>
            <SelectItem value="global">{t("settings.skills.scopeGlobal")}</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.path}>
                {p.name}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
      </div>

      {filteredSkills.length === 0 ? (
        <div className="rounded-xl bg-card/60 border border-border/30 py-8">
          <p className="text-sm text-muted-foreground text-center">
            {searchQuery
              ? t("settings.skills.noMatchingSkills", { query: searchQuery })
              : t("settings.skills.noInstalledSkills")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {filteredSkills.map((skill) => {
            const initials = getInitials(skill.name);
            const update = getUpdate(skill);
            return (
              <div
                key={`${skill.scope}-${skill.projectPath ?? ""}-${skill.dirName}`}
                className="group relative flex flex-col p-4 rounded-xl bg-card/80 border border-border/40 cursor-pointer hover:bg-card hover:border-border/60 hover:shadow-sm transition-colors duration-200"
                onClick={() => setSelectedSkill(skill)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center justify-center size-10 rounded-lg bg-muted text-muted-foreground text-sm font-semibold shrink-0">
                    {initials}
                  </div>
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={skill.enabled}
                      disabled={togglingSkill !== null}
                      onCheckedChange={() => handleToggleEnabled(skill)}
                    />
                  </div>
                </div>

                <h3 className="text-sm font-medium text-foreground truncate mb-1">{skill.name}</h3>

                <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-8">
                  {skill.description || t("settings.skills.noDescription")}
                </p>

                <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                  {showScopeBadge && (
                    <Badge variant="outline" size="sm">
                      {skill.scope === "global"
                        ? t("settings.skills.scopeGlobal")
                        : (skill.projectPath?.split("/").pop() ??
                          t("settings.skills.scopeProject"))}
                    </Badge>
                  )}
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedSkill && (
        <SkillDetailModal
          skill={
            skills.find(
              (s) =>
                s.dirName === selectedSkill.dirName &&
                s.scope === selectedSkill.scope &&
                s.projectPath === selectedSkill.projectPath,
            ) ?? selectedSkill
          }
          update={getUpdate(selectedSkill)}
          onClose={() => setSelectedSkill(null)}
          onRefresh={onRefresh}
        />
      )}
    </>
  );
};
