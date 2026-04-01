import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Project } from "../../../../../../shared/features/project/types";
import type { RecommendedSkill, SkillMeta } from "../../../../../../shared/features/skills/types";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { cn } from "../../../../lib/utils";
import { SkillDetailModal } from "./skill-detail-modal";

const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface SkillDiscoverTabProps {
  skills: RecommendedSkill[];
  error: string | null;
  projects: Project[];
  onFindInstalled: (skillName: string) => SkillMeta | undefined;
  onRefresh: () => Promise<void>;
  onInstall: (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => Promise<void>;
}

export const SkillDiscoverTab = ({
  skills,
  error,
  projects,
  onFindInstalled,
  onRefresh,
  onInstall,
}: SkillDiscoverTabProps) => {
  const { t } = useTranslation();
  const [selectedRecommended, setSelectedRecommended] = useState<RecommendedSkill | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillMeta | null>(null);

  const handleInstallRecommended = async (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => {
    await onInstall(skill, scope, projectPath);
  };

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

  if (skills.length === 0) {
    return (
      <div className="rounded-xl bg-muted/30 border border-border/50 py-8">
        <p className="text-sm text-muted-foreground text-center">
          {t("settings.skills.noMatchingSkills", { query: "" })}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        {skills.map((skill) => {
          const initials = getInitials(skill.name);
          return (
            <div
              key={skill.sourceRef}
              className={cn(
                "group relative flex flex-col p-4 rounded-xl bg-background border border-border/50 cursor-pointer hover:border-border hover:shadow-sm transition-all",
                skill.installed && "opacity-60",
              )}
              onClick={() => {
                if (skill.installed) {
                  const match = onFindInstalled(skill.skillName);
                  if (match) setSelectedSkill(match);
                } else {
                  setSelectedRecommended(skill);
                }
              }}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center justify-center size-10 rounded-lg bg-muted text-muted-foreground text-sm font-semibold shrink-0">
                  {initials}
                </div>
                {skill.installed ? (
                  <Badge variant="secondary" size="sm">
                    {t("settings.skills.installedBadge")}
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInstallRecommended(skill, "global");
                    }}
                  >
                    <Download className="size-3.5" />
                  </Button>
                )}
              </div>

              <h3 className="text-sm font-medium text-foreground truncate mb-1">{skill.name}</h3>

              <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-8">
                {skill.description}
              </p>

              <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                <Badge variant="outline" size="sm">
                  {skill.source}
                </Badge>
                {skill.version && (
                  <Badge variant="secondary" size="sm">
                    v{skill.version}
                  </Badge>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selectedSkill && (
        <SkillDetailModal
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onRefresh={onRefresh}
        />
      )}

      {selectedRecommended && (
        <SkillDetailModal
          recommendedSkill={selectedRecommended}
          projects={projects}
          onClose={() => setSelectedRecommended(null)}
          onRefresh={onRefresh}
          onInstall={handleInstallRecommended}
        />
      )}
    </>
  );
};
