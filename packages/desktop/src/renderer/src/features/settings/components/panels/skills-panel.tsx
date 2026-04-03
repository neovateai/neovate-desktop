import debug from "debug";
import { CheckCircle, Download, Plus, RefreshCw, Search, Settings2, Wand2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type {
  RecommendedSkill,
  RegistryGroup,
  SkillMeta,
  SkillUpdate,
} from "../../../../../../shared/features/skills/types";

import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Input } from "../../../../components/ui/input";
import { Spinner } from "../../../../components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../../../components/ui/tabs";
import { cn } from "../../../../lib/utils";
import { client } from "../../../../orpc";
import { claudeCodeChatManager } from "../../../agent/chat-manager";
import { useConfigStore } from "../../../config/store";
import { useProjectStore } from "../../../project/store";
import { SkillAddModal } from "./skill-add-modal";
import { SkillDiscoverTab } from "./skill-discover-tab";
import { SkillInstalledTab } from "./skill-installed-tab";
import { SkillRegistryModal } from "./skill-registry-modal";

const log = debug("neovate:settings:skills");

export const SkillsPanel = () => {
  const { t } = useTranslation();
  const projects = useProjectStore((s) => s.projects);
  const registries = useConfigStore((s) => s.skillsRegistries);

  const [installed, setInstalled] = useState<SkillMeta[]>([]);
  const [recommended, setRecommended] = useState<RegistryGroup[]>([]);
  const [updates, setUpdates] = useState<SkillUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState("discover");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showRegistryModal, setShowRegistryModal] = useState(false);

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
      log("fetched recommended groups: count=%d", recommendedResult.length);
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

  const refreshAfterMutation = useCallback(async () => {
    await fetchData();
    const projectPath = useProjectStore.getState().activeProject?.path;
    claudeCodeChatManager.invalidateNewSessions(projectPath);
  }, [fetchData]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData(true);
    setRefreshing(false);
  }, [fetchData]);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const filteredInstalled = useMemo(() => {
    if (!searchQuery) return installed;
    const q = searchQuery.toLowerCase();
    return installed.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
    );
  }, [installed, searchQuery]);

  const filteredRecommended = useMemo((): RegistryGroup[] => {
    return recommended
      .map((group) => {
        let skills = group.skills;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          skills = skills.filter(
            (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
          );
        }
        skills = [...skills].sort((a, b) => {
          if (a.installed !== b.installed) return a.installed ? 1 : -1;
          return a.name.localeCompare(b.name);
        });
        return { ...group, skills };
      })
      .filter((group) => group.skills.length > 0);
  }, [recommended, searchQuery]);

  const onFindInstalled = useCallback(
    (skillName: string) => installed.find((s) => s.dirName === skillName),
    [installed],
  );

  const handleInstallRecommended = useCallback(
    async (skill: RecommendedSkill, scope: "global" | "project", projectPath?: string) => {
      log("installing recommended skill: name=%s scope=%s", skill.name, scope);
      try {
        await client.skills.install({
          sourceRef: skill.sourceRef,
          skillName: skill.skillName,
          scope,
          projectPath,
        });
        await refreshAfterMutation();
      } catch (e: any) {
        setError(e.message || t("settings.skills.installFailed"));
      }
    },
    [refreshAfterMutation], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleAddRegistry = useCallback(
    async (registry: { url: string }) => {
      const updated = [...registries, registry];
      await client.config.set({ key: "skillsRegistries", value: updated });
      useConfigStore.setState({ skillsRegistries: updated });
      await refresh();
    },
    [registries, refresh],
  );

  const handleRemoveRegistry = useCallback(
    async (index: number) => {
      const updated = registries.filter((_, i) => i !== index);
      await client.config.set({ key: "skillsRegistries", value: updated });
      useConfigStore.setState({ skillsRegistries: updated });
      await refresh();
    },
    [registries, refresh],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold mb-8 flex items-center gap-3 text-foreground">
        <span className="flex items-center justify-center size-9 rounded-xl bg-primary/10">
          <Wand2 className="size-5 text-primary" />
        </span>
        {t("settings.skills")}
      </h1>

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
        <Button variant="outline" size="sm" onClick={() => setShowRegistryModal(true)}>
          <Settings2 className="size-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={refresh} disabled={refreshing}>
          <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList variant="pill" className="mb-5">
          <TabsTrigger value="discover">
            <Download className="size-3.5 mr-1.5" />
            {t("settings.skills.discover")}
          </TabsTrigger>
          <TabsTrigger value="installed">
            <CheckCircle className="size-3.5 mr-1.5" />
            {t("settings.skills.installedTab")}
            {installed.length > 0 && (
              <Badge variant="secondary" size="sm" className="ml-1.5">
                {installed.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="discover">
          <SkillDiscoverTab
            groups={filteredRecommended}
            registries={registries}
            error={recommendedError}
            projects={projects}
            onFindInstalled={onFindInstalled}
            onRefresh={refreshAfterMutation}
            onInstall={handleInstallRecommended}
            onAddRegistry={() => setShowRegistryModal(true)}
          />
        </TabsContent>

        <TabsContent value="installed">
          <SkillInstalledTab
            skills={filteredInstalled}
            updates={updates}
            error={error}
            projects={projects}
            searchQuery={searchQuery}
            onRefresh={refreshAfterMutation}
          />
        </TabsContent>
      </Tabs>

      {showAddModal && (
        <SkillAddModal
          projects={projects}
          onClose={() => setShowAddModal(false)}
          onRefresh={refreshAfterMutation}
        />
      )}

      {showRegistryModal && (
        <SkillRegistryModal
          registries={registries}
          onAdd={handleAddRegistry}
          onRemove={handleRemoveRegistry}
          onClose={() => setShowRegistryModal(false)}
        />
      )}
    </div>
  );
};
