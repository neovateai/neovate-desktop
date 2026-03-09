import { useCallback, useEffect } from "react";

import { client } from "../../../orpc";
import { useProjectStore } from "../store";

export function useProject() {
  const { projects, activeProject, loading, setProjects, setActiveProject, setLoading } =
    useProjectStore();

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const [list, active] = await Promise.all([client.project.list(), client.project.getActive()]);
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
    const result = await client.project.pickDirectory();
    if (!result) return null;
    const project = await client.project.open({ path: result.path });
    await fetchProjects();
    return project;
  }, [fetchProjects]);

  const createProject = useCallback(
    async (path: string, name?: string) => {
      const project = await client.project.create({ path, name });
      await fetchProjects();
      return project;
    },
    [fetchProjects],
  );

  const removeProject = useCallback(
    async (id: string) => {
      await client.project.remove({ id });
      await fetchProjects();
    },
    [fetchProjects],
  );

  const switchProject = useCallback(
    async (id: string | null) => {
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
