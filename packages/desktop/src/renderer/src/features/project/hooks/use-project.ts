import { ORPCError } from "@orpc/client";
import debug from "debug";
import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { toastManager } from "../../../components/ui/toast";
import { client } from "../../../orpc";
import { useProjectStore } from "../store";

const log = debug("neovate:project");

export function useProject() {
  const { t } = useTranslation();
  const { projects, activeProject, loading, setProjects, setActiveProject, setLoading } =
    useProjectStore();

  const fetchProjects = useCallback(async () => {
    log("fetching projects");
    setLoading(true);
    try {
      const [list, active] = await Promise.all([client.project.list(), client.project.getActive()]);
      log("projects fetched", { count: list.length, activeId: active?.id ?? null });
      setProjects(list);
      setActiveProject(active);
    } finally {
      setLoading(false);
    }
  }, [setProjects, setActiveProject, setLoading]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  const openProject = useCallback(async () => {
    log("opening project via directory picker");
    const result = await client.project.pickDirectory();
    if (!result) {
      log("directory picker canceled");
      return null;
    }
    log("opening project at path", { path: result.path });
    const project = await client.project.open({ path: result.path });
    log("project opened", { id: project.id, name: project.name });
    await fetchProjects();
    return project;
  }, [fetchProjects]);

  const createProject = useCallback(
    async (path: string, name?: string) => {
      log("create project", { path, name });
      const project = await client.project.create({ path, name });
      log("project created", { id: project.id, name: project.name });
      await fetchProjects();
      return project;
    },
    [fetchProjects],
  );

  const removeProject = useCallback(
    async (id: string) => {
      log("remove project", { id });
      await client.project.remove({ id });
      await fetchProjects();
    },
    [fetchProjects],
  );

  const switchProject = useCallback(
    async (id: string | null) => {
      log("switch project", { id });
      try {
        await client.project.setActive({ id });
      } catch (error) {
        const project = useProjectStore.getState().projects.find((p) => p.id === id);
        const name = project?.name ?? "project";
        const isStale = error instanceof ORPCError && error.code === "BAD_REQUEST";
        toastManager.add({
          type: "warning",
          title: isStale ? t("project.cannotSwitch", { name }) : t("project.switchFailed"),
          description: isStale
            ? t("project.directoryNoLongerExists")
            : t("project.switchFailedDescription"),
          timeout: 5000,
        });
        if (isStale) await fetchProjects();
        return;
      }
      await fetchProjects();
    },
    [fetchProjects, t],
  );

  return {
    projects,
    activeProject,
    loading,
    openProject,
    createProject,
    removeProject,
    switchProject,
  };
}
