import debug from "debug";
import { ArrowUpCircle, Download, Plus, RefreshCw, Search, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

// Get initials from skill name
const getInitials = (name: string): string => {
  const words = name.split(/[\s-_]+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};

import type {
  RecommendedSkill,
  SkillMeta,
  SkillUpdate,
} from "../../../../../../shared/features/skills/types";

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
import { Spinner } from "../../../../components/ui/spinner";
import { Switch } from "../../../../components/ui/switch";
import { cn } from "../../../../lib/utils";
import { client } from "../../../../orpc";
import { useProjectStore } from "../../../project/store";
import { SkillAddModal } from "./skill-add-modal";
import { SkillDetailModal } from "./skill-detail-modal";

const log = debug("neovate:settings:skills");

type ScopeFilter = "all" | "global" | string; // string = projectPath

export const SkillsPanel = () => {
  const { t } = useTranslation();
  const projects = useProjectStore((s) => s.projects);

  const [installed, setInstalled] = useState<SkillMeta[]>([]);
  const [recommended, setRecommended] = useState<RecommendedSkill[]>([]);
  const [updates, setUpdates] = useState<SkillUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("global");
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  // Modal state
  const [selectedSkill, setSelectedSkill] = useState<SkillMeta | null>(null);
  const [selectedRecommended, setSelectedRecommended] = useState<RecommendedSkill | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  const fetchingRef = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (fetchingRef.current) {
      log("fetchData skipped (already fetching)");
      return;
    }
    fetchingRef.current = true;
    log("fetchData forceRefresh=%s", forceRefresh);
    setError(null);
    setRecommendedError(null);
    try {
      const installedResult = await client.skills.list({ scope: "all" });
      setInstalled(installedResult);
      log("fetched installed skills: count=%d", installedResult.length);
    } catch (e: any) {
      log("fetchData list error: %s", e.message);
      setError(e.message || t("settings.skills.loadFailed"));
    }
    try {
      const recommendedResult = await client.skills.recommended({ forceRefresh });
      setRecommended(recommendedResult);
      log("fetched recommended skills: count=%d", recommendedResult.length);
    } catch (e: any) {
      log("fetchData recommended error: %s", e.message);
      setRecommendedError(e.message || t("settings.skills.recommendedLoadFailed"));
    }
    try {
      const updatesResult = await client.skills.checkUpdates({ scope: "all" });
      setUpdates(updatesResult);
      log("fetched skill updates: count=%d", updatesResult.length);
    } catch {
      // Non-critical — silently ignore
    }
    fetchingRef.current = false;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- t is stable enough, avoid re-fetch loops

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

  const [togglingSkill, setTogglingSkill] = useState<string | null>(null);
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
      await fetchData();
    } catch {
      // Silently fail — user can retry
    } finally {
      setTogglingSkill(null);
    }
  };

  const handleInstallRecommended = async (
    skill: RecommendedSkill,
    scope: "global" | "project",
    projectPath?: string,
  ) => {
    log("installing recommended skill: name=%s scope=%s", skill.name, scope);
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

  const showScopeBadge = scopeFilter === "all";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <Wand2 className="size-5 text-primary" />
        </span>
        {t("settings.skills")}
      </h1>

      {/* Toolbar: Search + Actions */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground z-10" />
          <Input
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("settings.skills.searchPlaceholder")}
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)}>
          <Plus className="size-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
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
            {t("settings.skills.installed", { count: filteredInstalled.length })}
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

        {filteredInstalled.length === 0 ? (
          <div className="rounded-xl bg-muted/30 border border-border/50 py-8">
            <p className="text-sm text-muted-foreground text-center">
              {searchQuery
                ? t("settings.skills.noMatchingSkills", { query: searchQuery })
                : t("settings.skills.noInstalledSkills")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {filteredInstalled.map((skill) => {
              const initials = getInitials(skill.name);
              const update = getUpdate(skill);
              return (
                <div
                  key={`${skill.scope}-${skill.projectPath ?? ""}-${skill.dirName}`}
                  className="group relative flex flex-col p-4 rounded-xl bg-background border border-border/50 cursor-pointer hover:border-border hover:shadow-sm transition-all"
                  onClick={() => setSelectedSkill(skill)}
                >
                  {/* Header: Avatar + Toggle */}
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

                  {/* Title */}
                  <h3 className="text-sm font-medium text-foreground truncate mb-1">
                    {skill.name}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-8">
                    {skill.description || t("settings.skills.noDescription")}
                  </p>

                  {/* Badges */}
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
      </div>

      {/* Recommended Section */}
      {recommendedError ? (
        <div className="mb-6">
          <h2 className="text-sm font-medium mb-3 text-muted-foreground">
            {t("settings.skills.recommended")}
          </h2>
          <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {recommendedError}
            <button className="ml-2 underline" onClick={refresh}>
              {t("settings.skills.retry")}
            </button>
          </div>
        </div>
      ) : filteredRecommended.length === 0 ? null : (
        <div className="mb-6">
          <h2 className="text-sm font-medium mb-3 text-muted-foreground">
            {t("settings.skills.recommendedCount", { count: filteredRecommended.length })}
          </h2>
          <div className="grid grid-cols-3 gap-3">
            {filteredRecommended.map((skill) => {
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
                      const match = installed.find((s) => s.dirName === skill.skillName);
                      if (match) setSelectedSkill(match);
                    } else {
                      setSelectedRecommended(skill);
                    }
                  }}
                >
                  {/* Header: Avatar + Action */}
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

                  {/* Title */}
                  <h3 className="text-sm font-medium text-foreground truncate mb-1">
                    {skill.name}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-3 min-h-8">
                    {skill.description}
                  </p>

                  {/* Badges */}
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
        </div>
      )}

      {/* Detail Modal */}
      {selectedSkill && (
        <SkillDetailModal
          skill={
            installed.find(
              (s) =>
                s.dirName === selectedSkill.dirName &&
                s.scope === selectedSkill.scope &&
                s.projectPath === selectedSkill.projectPath,
            ) ?? selectedSkill
          }
          update={getUpdate(selectedSkill)}
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
