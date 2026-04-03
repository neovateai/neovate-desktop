import { Download, ExternalLink, Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { Project } from "../../../../../../shared/features/project/types";
import type {
  RecommendedSkill,
  RegistryGroup,
  SkillBadgeType,
  SkillMeta,
} from "../../../../../../shared/features/skills/types";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Spinner } from "../../../../components/ui/spinner";
import { cn } from "../../../../lib/utils";
import { SkillDetailModal } from "./skill-detail-modal";

const skillBadgeVariantMap: Record<
  SkillBadgeType,
  "success" | "info" | "secondary" | "default" | "warning"
> = {
  recommended: "success",
  official: "info",
  popular: "secondary",
  new: "default",
  deprecated: "warning",
};

const skillBadgeRenderPriority: Record<SkillBadgeType, number> = {
  official: 1,
  recommended: 2,
  popular: 3,
  new: 4,
  deprecated: 5,
};

const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

interface SkillDiscoverTabProps {
  groups: RegistryGroup[];
  registries: { url: string }[];
  error: string | null;
  projects: Project[];
  onFindInstalled: (skillName: string) => SkillMeta | undefined;
  onRefresh: () => Promise<void>;
  onInstall: (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => Promise<void>;
  onAddRegistry: () => void;
}

export const SkillDiscoverTab = ({
  groups,
  registries,
  error,
  projects,
  onFindInstalled,
  onRefresh,
  onInstall,
  onAddRegistry,
}: SkillDiscoverTabProps) => {
  const { t } = useTranslation();
  const [selectedRecommended, setSelectedRecommended] = useState<RecommendedSkill | null>(null);
  const [selectedSkill, setSelectedSkill] = useState<SkillMeta | null>(null);
  const [installingRef, setInstallingRef] = useState<string | null>(null);

  const showHeaders = groups.length > 1;

  const handleInstallRecommended = async (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => {
    setInstallingRef(skill.sourceRef);
    try {
      await onInstall(skill, scope, projectPath);
    } finally {
      setInstallingRef(null);
    }
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

  // Empty state: no registries configured
  if (registries.length === 0) {
    return (
      <div className="rounded-xl bg-card/60 border border-border/30 py-12 px-6 text-center">
        <div className="flex items-center justify-center size-12 rounded-xl bg-primary/10 mx-auto mb-4">
          <Download className="size-6 text-primary" />
        </div>
        <h3 className="text-sm font-medium text-foreground mb-2">
          {t("settings.skills.noRegistries")}
        </h3>
        <p className="text-xs text-muted-foreground mb-4 max-w-sm mx-auto">
          {t("settings.skills.noRegistriesDescription")}
        </p>
        <Button variant="default" size="sm" onClick={onAddRegistry}>
          <Plus className="size-3.5" />
          {t("settings.skills.addRegistry")}
        </Button>
      </div>
    );
  }

  // Registries configured but no skills (after filtering)
  if (groups.length === 0) {
    return (
      <div className="rounded-xl bg-card/60 border border-border/30 py-8">
        <p className="text-sm text-muted-foreground text-center">
          {t("settings.skills.noMatchingSkills", { query: "" })}
        </p>
      </div>
    );
  }

  const renderSkillCard = (skill: RecommendedSkill) => {
    const initials = getInitials(skill.name);
    const isInstalling = installingRef === skill.sourceRef;
    const isDeprecated = skill.badges?.includes("deprecated") ?? false;
    const sortedBadges = skill.badges
      ?.slice()
      .sort((a, b) => skillBadgeRenderPriority[a] - skillBadgeRenderPriority[b])
      .slice(0, 2);
    return (
      <div
        key={skill.sourceRef}
        className={cn(
          "group relative flex flex-col p-4 rounded-xl bg-card/80 border border-border/40 cursor-pointer hover:bg-card hover:border-border/60 hover:shadow-sm transition-colors duration-200",
          skill.installed && "opacity-60",
          isDeprecated && !skill.installed && "opacity-60",
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
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
              disabled={installingRef !== null}
              onClick={(e) => {
                e.stopPropagation();
                handleInstallRecommended(skill, "global");
              }}
            >
              {isInstalling ? <Spinner className="size-3.5" /> : <Download className="size-3.5" />}
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
          {sortedBadges?.map((badge) => (
            <Badge key={badge} variant={skillBadgeVariantMap[badge]} size="sm">
              {t(`settings.skills.badge.${badge}`)}
            </Badge>
          ))}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6">
        {groups.map((group, i) => (
          <section key={`${group.name}-${i}`}>
            {showHeaders && (
              <div className="flex items-center gap-2 mb-3">
                <h2 className="text-sm font-medium text-foreground">{group.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {t("settings.skills.registrySkillCount", { count: group.skills.length })}
                </span>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">{group.skills.map(renderSkillCard)}</div>

            {group.url && (
              <div className="mt-3 text-center">
                <a
                  href={group.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  {t("settings.skills.checkMore")}
                  <ExternalLink className="size-3" />
                </a>
              </div>
            )}
          </section>
        ))}
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
