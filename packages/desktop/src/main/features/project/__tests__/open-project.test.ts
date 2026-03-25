import { describe, expect, it, vi } from "vitest";

import type { Project } from "../../../../shared/features/project/types";

import { openProjectByPath } from "../open-project";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "project-uuid"),
}));

function createStore(projects: Project[] = []) {
  const state = { projects: [...projects], activeProjectId: null as string | null };

  return {
    state,
    findByPath: vi.fn((projectPath: string) =>
      state.projects.find((project) => project.path === projectPath),
    ),
    add: vi.fn((project: Project) => {
      state.projects.push(project);
    }),
    update: vi.fn((id: string, updates: Partial<Project>) => {
      state.projects = state.projects.map((project) =>
        project.id === id ? { ...project, ...updates } : project,
      );
    }),
    setActive: vi.fn((id: string | null) => {
      state.activeProjectId = id;
    }),
  };
}

describe("openProjectByPath", () => {
  it("activates an existing project and refreshes lastAccessedAt", () => {
    const store = createStore([
      {
        id: "existing-id",
        name: "demo",
        path: "/tmp/demo",
        createdAt: "2026-03-25T10:00:00.000Z",
        lastAccessedAt: "2026-03-25T10:00:00.000Z",
      },
    ]);

    const project = openProjectByPath(store as any, "/tmp/demo");

    expect(project.id).toBe("existing-id");
    expect(store.update).toHaveBeenCalledWith(
      "existing-id",
      expect.objectContaining({ lastAccessedAt: expect.any(String) }),
    );
    expect(store.setActive).toHaveBeenCalledWith("existing-id");
    expect(store.add).not.toHaveBeenCalled();
  });

  it("creates and activates a new project when the path is unknown", () => {
    const store = createStore();

    const project = openProjectByPath(store as any, "/tmp/fresh-project");

    expect(project).toEqual({
      id: "project-uuid",
      name: "fresh-project",
      path: "/tmp/fresh-project",
      createdAt: expect.any(String),
      lastAccessedAt: expect.any(String),
    });
    expect(store.add).toHaveBeenCalledWith(project);
    expect(store.setActive).toHaveBeenCalledWith("project-uuid");
  });
});
