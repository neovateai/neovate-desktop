export type Project = {
  id: string;
  name: string;
  path: string;
  createdAt: string;
  lastAccessedAt: string;
};

export type ProjectStore = {
  projects: Project[];
  activeProjectId: string | null;
};
