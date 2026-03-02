import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import type { Project } from "../../../../shared/features/project/types";

type ProjectState = {
  projects: Project[];
  activeProject: Project | null;
  loading: boolean;

  setProjects: (projects: Project[]) => void;
  setActiveProject: (project: Project | null) => void;
  setLoading: (loading: boolean) => void;
};

export const useProjectStore = create<ProjectState>()(
  immer((set) => ({
    projects: [],
    activeProject: null,
    loading: false,

    setProjects: (projects) => set({ projects }),
    setActiveProject: (activeProject) => set({ activeProject }),
    setLoading: (loading) => set({ loading }),
  })),
);
