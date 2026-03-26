import debug from "debug";
import Store from "electron-store";

import type {
  Project,
  ProjectStore as ProjectStoreSchema,
} from "../../../shared/features/project/types";
import type { ProjectProviderConfig } from "../../../shared/features/provider/types";

import { APP_DATA_DIR } from "../../core/app-paths";

const log = debug("neovate:project:store");

export class ProjectStore {
  private store: Store<ProjectStoreSchema>;

  constructor() {
    this.store = new Store<ProjectStoreSchema>({
      name: "projects",
      cwd: APP_DATA_DIR,
      defaults: {
        projects: [],
        activeProjectId: null,
        archivedSessions: {},
        pinnedSessions: {},
        closedProjectAccordions: [],
        providerSelections: {},
        sessionStartTimes: {},
        crashCount: 0,
        lastCrashTs: 0,
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
    log("add project", { id: project.id, name: project.name, path: project.path });
    const projects = this.getAll();
    projects.push(project);
    this.store.set("projects", projects);
  }

  remove(id: string): void {
    log("remove project", { id });
    const projects = this.getAll().filter((p) => p.id !== id);
    this.store.set("projects", projects);
    if (this.store.get("activeProjectId") === id) {
      log("removed project was active, clearing activeProjectId");
      this.store.set("activeProjectId", null);
    }
  }

  update(id: string, updates: Partial<Project>): void {
    const projects = this.getAll().map((p) => (p.id === id ? { ...p, ...updates } : p));
    this.store.set("projects", projects);
  }

  setActive(id: string | null): void {
    if (id !== null && !this.get(id)) {
      log("setActive: project not found, ignoring", { id });
      return;
    }
    log("set active project", { id });
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
    log("archive session", { projectPath, sessionId });
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
      log("session was pinned, unpinning", { sessionId });
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
      log("unpin session", { projectPath, sessionId });
      pinned[projectPath] = list.filter((id) => id !== sessionId);
    } else {
      log("pin session", { projectPath, sessionId });
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
    log("reorder projects", { projectIds });
    const projects = this.getAll();
    const map = new Map(projects.map((p) => [p.id, p]));
    const reordered = projectIds.flatMap((id) => {
      const p = map.get(id);
      return p ? [p] : [];
    });
    this.store.set("projects", reordered);
  }

  recordCrash(): void {
    this.store.set("crashCount", (this.store.get("crashCount") ?? 0) + 1);
    this.store.set("lastCrashTs", Date.now());
  }

  checkCrashLoop(): boolean {
    const count = this.store.get("crashCount") ?? 0;
    const ts = this.store.get("lastCrashTs") ?? 0;
    return count >= 3 && Date.now() - ts < 60_000;
  }

  clearCrashCounter(): void {
    this.store.set("crashCount", 0);
    this.store.set("lastCrashTs", 0);
  }

  getSessionStartTimes(): Record<string, string> {
    return this.store.get("sessionStartTimes");
  }

  setSessionStartTime(sessionId: string, createdAt: string): void {
    log("setSessionStartTime: sessionId=%s createdAt=%s", sessionId, createdAt);
    const times = this.store.get("sessionStartTimes");
    times[sessionId] = createdAt;
    this.store.set("sessionStartTimes", times);
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
