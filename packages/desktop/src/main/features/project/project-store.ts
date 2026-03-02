import Store from "electron-store";
import type {
  Project,
  ProjectStore as ProjectStoreSchema,
} from "../../../shared/features/project/types";

export class ProjectStore {
  private store: Store<ProjectStoreSchema>;

  constructor() {
    this.store = new Store<ProjectStoreSchema>({
      name: "projects",
      defaults: {
        projects: [],
        activeProjectId: null,
      },
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
}
