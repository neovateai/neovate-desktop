import Store from "electron-store";
import os from "node:os";
import path from "node:path";

import type {
  Project,
  ProjectStore as ProjectStoreSchema,
} from "../../../shared/features/project/types";
import type { ProjectProviderConfig } from "../../../shared/features/provider/types";

export class ProjectStore {
  private store: Store<ProjectStoreSchema>;

  constructor() {
    this.store = new Store<ProjectStoreSchema>({
      name: "projects",
      cwd: path.join(os.homedir(), ".neovate-desktop"),
      defaults: {
        projects: [],
        activeProjectId: null,
        archivedSessions: {},
        pinnedSessions: {},
        closedProjectAccordions: [],
        providerSelections: {},
      },
      serialize: (value) => JSON.stringify(value, null, 2) + "\n",
    });
  }

  getAll(): Project[] {
    return this.store.get("projects");
  }

  get(id: string): Project | undefined {
    return this.getAll().find((p) => p.id === id);
  }

  findByPath(path: string): Project | undefined {
    return this.getAll().find((p) => p.path === path);
  }

  add(project: Project): void {
    const projects = this.getAll();
    projects.push(project);
    this.store.set("projects", projects);
  }

  remove(id: string): void {
    const projects = this.getAll().filter((p) => p.id !== id);
    this.store.set("projects", projects);
    if (this.store.get("activeProjectId") === id) {
      this.store.set("activeProjectId", null);
    }
  }

  update(id: string, updates: Partial<Project>): void {
    const projects = this.getAll().map((p) => (p.id === id ? { ...p, ...updates } : p));
    this.store.set("projects", projects);
  }

  setActive(id: string | null): void {
    if (id !== null && !this.get(id)) return;
    this.store.set("activeProjectId", id);
  }

  getActiveId(): string | null {
    return this.store.get("activeProjectId");
  }

  getActive(): Project | null {
    const id = this.getActiveId();
    if (!id) return null;
    return this.get(id) ?? null;
  }

  getArchivedSessions(): Record<string, string[]> {
    return this.store.get("archivedSessions");
  }

  archiveSession(projectPath: string, sessionId: string): void {
    const archived = this.store.get("archivedSessions");
    const list = archived[projectPath] ?? [];
    if (!list.includes(sessionId)) {
      archived[projectPath] = [...list, sessionId];
      this.store.set("archivedSessions", archived);
    }
    // Also unpin if pinned
    const pinned = this.store.get("pinnedSessions");
    const pinnedList = pinned[projectPath];
    if (pinnedList?.includes(sessionId)) {
      pinned[projectPath] = pinnedList.filter((id) => id !== sessionId);
      this.store.set("pinnedSessions", pinned);
    }
  }

  getPinnedSessions(): Record<string, string[]> {
    return this.store.get("pinnedSessions");
  }

  togglePinSession(projectPath: string, sessionId: string): void {
    const pinned = this.store.get("pinnedSessions");
    const list = pinned[projectPath] ?? [];
    if (list.includes(sessionId)) {
      pinned[projectPath] = list.filter((id) => id !== sessionId);
    } else {
      pinned[projectPath] = [...list, sessionId];
    }
    this.store.set("pinnedSessions", pinned);
  }

  getClosedProjectAccordions(): string[] {
    return this.store.get("closedProjectAccordions") ?? [];
  }

  setClosedProjectAccordions(ids: string[]): void {
    this.store.set("closedProjectAccordions", ids);
  }

  getProjectSelection(cwd: string): ProjectProviderConfig {
    const selections = this.store.get("providerSelections") ?? {};
    const sel = selections[cwd];
    return {
      provider: sel?.provider,
      model: sel?.model,
    };
  }

  reorder(projectIds: string[]): void {
    const projects = this.getAll();
    const map = new Map(projects.map((p) => [p.id, p]));
    const reordered = projectIds.flatMap((id) => {
      const p = map.get(id);
      return p ? [p] : [];
    });
    this.store.set("projects", reordered);
  }

  setProjectSelection(cwd: string, provider?: string | null, model?: string | null): void {
    const selections = this.store.get("providerSelections") ?? {};
    const existing = selections[cwd] ?? {};
    if (provider === null) {
      delete existing.provider;
    } else if (provider !== undefined) {
      existing.provider = provider;
    }
    if (model === null) {
      delete existing.model;
    } else if (model !== undefined) {
      existing.model = model;
    }
    selections[cwd] = existing;
    this.store.set("providerSelections", selections);
  }
}
