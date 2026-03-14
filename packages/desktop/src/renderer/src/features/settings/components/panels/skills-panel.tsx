import { Download, Loader2, Plus, RefreshCw, Search, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import type { RecommendedSkill, SkillMeta } from "../../../../../../shared/features/skills/types";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../components/ui/select";
import { Switch } from "../../../../components/ui/switch";
import { cn } from "../../../../lib/utils";
import { client } from "../../../../orpc";
import { useProjectStore } from "../../../project/store";
import { SkillAddModal } from "./skill-add-modal";
import { SkillDetailModal } from "./skill-detail-modal";

type ScopeFilter = "all" | "global" | string; // string = projectPath

export const SkillsPanel = () => {
  const { t } = useTranslation();
  const projects = useProjectStore((s) => s.projects);

  const [installed, setInstalled] = useState<SkillMeta[]>([]);
  const [recommended, setRecommended] = useState<RecommendedSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [selectedSkill, setSelectedSkill] = useState<SkillMeta | null>(null);
  const [selectedRecommended, setSelectedRecommended] = useState<RecommendedSkill | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      setError(null);
      setRecommendedError(null);
      try {
        const installedResult = await client.skills.list({ scope: "all" });
        setInstalled(installedResult);
      } catch (e: any) {
        setError(e.message || t("settings.skills.loadFailed"));
      }
      try {
        const recommendedResult = await client.skills.recommended({ forceRefresh });
        setRecommended(recommendedResult);
      } catch (e: any) {
        setRecommendedError(e.message || "Failed to load recommended skills.");
      }
    },
    [t],
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // Filter installed skills by scope
  const filteredInstalled = useMemo(() => {
    let list = installed;
    if (scopeFilter === "global") {
      list = list.filter((s) => s.scope === "global");
    } else if (scopeFilter !== "all") {
      list = list.filter((s) => s.scope === "project" && s.projectPath === scopeFilter);
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
      );
    }
    return list;
  }, [installed, scopeFilter, searchQuery]);

  // Filter recommended, sort installed to bottom
  const filteredRecommended = useMemo(() => {
    let list = recommended;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (a.installed !== b.installed) return a.installed ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
  }, [recommended, searchQuery]);

  const handleToggleEnabled = async (skill: SkillMeta, e: React.MouseEvent) => {
    e.stopPropagation();
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
      await fetchData();
    } catch {
      // Silently fail — user can retry
    }
  };

  const handleInstallRecommended = async (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => {
    try {
      await client.skills.install({
        sourceRef: skill.sourceRef,
        skillName: skill.skillName,
        scope,
        projectPath,
      });
      await fetchData();
    } catch (e: any) {
      setError(e.message || t("settings.skills.installFailed"));
    }
  };

  const showScopeBadge = scopeFilter === "all";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold flex items-center gap-2 text-foreground">
          <Wand2 className="size-[22px]" />
          {t("settings.skills")}
        </h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          className="pl-9"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search skills..."
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
          {error}
          <button
            className="ml-2 underline"
            onClick={() => {
              setError(null);
              refresh();
            }}
          >
            {t("settings.skills.retry")}
          </button>
        </div>
      )}

      {/* Installed Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Installed ({filteredInstalled.length})
          </h2>
          <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as ScopeFilter)}>
            <SelectTrigger size="sm" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="global">Global</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.path}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </div>

        {filteredInstalled.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            {searchQuery
              ? `No skills matching "${searchQuery}"`
              : "No skills installed. Browse recommended skills below or add from URL."}
          </p>
        ) : (
          <div className="space-y-1">
            {filteredInstalled.map((skill) => (
              <div
                key={`${skill.scope}-${skill.projectPath ?? ""}-${skill.name}`}
                className="flex items-center justify-between p-3 rounded-md bg-muted border border-border cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => setSelectedSkill(skill)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium text-foreground truncate">{skill.name}</span>
                  {showScopeBadge && (
                    <Badge variant="outline" size="sm">
                      {skill.scope === "global"
                        ? "global"
                        : (skill.projectPath?.split("/").pop() ?? "project")}
                    </Badge>
                  )}
                  {skill.version && (
                    <Badge variant="secondary" size="sm">
                      v{skill.version}
                    </Badge>
                  )}
                </div>
                <div onClick={(e) => handleToggleEnabled(skill, e)}>
                  <Switch checked={skill.enabled} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recommended Section */}
      {recommendedError ? (
        <div className="mb-6">
          <h2 className="text-sm font-medium mb-3 text-muted-foreground">Recommended</h2>
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {recommendedError}
            <button className="ml-2 underline" onClick={refresh}>
              Retry
            </button>
          </div>
        </div>
      ) : filteredRecommended.length === 0 ? null : (
        <div className="mb-6">
          <h2 className="text-sm font-medium mb-3 text-muted-foreground">
            Recommended ({filteredRecommended.length})
          </h2>
          <div className="space-y-1">
            {filteredRecommended.map((skill) => (
              <div
                key={skill.sourceRef}
                className="flex items-center justify-between p-3 rounded-md bg-muted border border-border cursor-pointer hover:bg-accent/50 transition-colors"
                onClick={() => {
                  if (skill.installed) {
                    const match = installed.find((s) => s.name === skill.skillName);
                    if (match) setSelectedSkill(match);
                  } else {
                    setSelectedRecommended(skill);
                  }
                }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{skill.name}</span>
                    <Badge variant="outline" size="sm">
                      {skill.source}
                    </Badge>
                    {skill.version && (
                      <Badge variant="secondary" size="sm">
                        v{skill.version}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {skill.description}
                  </p>
                </div>
                {skill.installed ? (
                  <Badge variant="secondary" size="sm">
                    Installed
                  </Badge>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleInstallRecommended(skill, "global");
                    }}
                  >
                    <Download className="size-3.5" />
                    Install
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add from URL */}
      <Button variant="outline" size="sm" className="w-full" onClick={() => setShowAddModal(true)}>
        <Plus className="size-4" />
        Add from URL/package...
      </Button>

      {/* Detail Modal */}
      {selectedSkill && (
        <SkillDetailModal
          skill={selectedSkill}
          onClose={() => setSelectedSkill(null)}
          onRefresh={fetchData}
        />
      )}

      {/* Recommended Detail Modal */}
      {selectedRecommended && (
        <SkillDetailModal
          recommendedSkill={selectedRecommended}
          projects={projects}
          onClose={() => setSelectedRecommended(null)}
          onRefresh={fetchData}
          onInstall={handleInstallRecommended}
        />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <SkillAddModal
          projects={projects}
          onClose={() => setShowAddModal(false)}
          onRefresh={fetchData}
        />
      )}
    </div>
  );
};
