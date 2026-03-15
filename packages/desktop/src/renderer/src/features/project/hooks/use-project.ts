import debug from "debug";
import { useCallback, useEffect } from "react";

import { client } from "../../../orpc";
import { useProjectStore } from "../store";

const log = debug("neovate:project");

export function useProject() {
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
      await client.project.setActive({ id });
      await fetchProjects();
    },
    [fetchProjects],
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
