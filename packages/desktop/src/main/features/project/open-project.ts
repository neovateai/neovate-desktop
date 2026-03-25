import { randomUUID } from "node:crypto";
import path from "node:path";

import type { Project } from "../../../shared/features/project/types";
import type { ProjectStore } from "./project-store";

export function openProjectByPath(projectStore: ProjectStore, projectPath: string): Project {
  const now = new Date().toISOString();
  const existing = projectStore.findByPath(projectPath);

  if (existing) {
    projectStore.update(existing.id, { lastAccessedAt: now });
    projectStore.setActive(existing.id);
    return { ...existing, lastAccessedAt: now };
  }

  const project: Project = {
    id: randomUUID(),
    name: path.basename(projectPath),
    path: projectPath,
    createdAt: now,
    lastAccessedAt: now,
  };

  projectStore.add(project);
  projectStore.setActive(project.id);
  return project;
}
