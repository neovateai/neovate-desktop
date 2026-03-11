import type { ProjectProviderConfig } from "../provider/types";

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
  /** projectPath → archived sessionIds */
  archivedSessions: Record<string, string[]>;
  /** projectPath → pinned sessionIds */
  pinnedSessions: Record<string, string[]>;
  closedProjectAccordions: string[];
  /** projectPath → provider/model selection */
  providerSelections: Record<string, ProjectProviderConfig>;
};
