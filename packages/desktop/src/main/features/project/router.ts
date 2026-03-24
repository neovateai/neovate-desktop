import { implement, ORPCError } from "@orpc/server";
import debug from "debug";
import { BrowserWindow, dialog } from "electron";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import type { AppContext } from "../../router";

import { projectContract } from "../../../shared/features/project/contract";

const log = debug("neovate:project");

/** Cached existsSync to avoid repeated filesystem checks on every list() call. */
const pathCache = new Map<string, { exists: boolean; ts: number }>();
const PATH_CACHE_TTL = 5_000;

function pathExists(p: string): boolean {
  const cached = pathCache.get(p);
  if (cached && Date.now() - cached.ts < PATH_CACHE_TTL) return cached.exists;
  const exists = existsSync(p);
  pathCache.set(p, { exists, ts: Date.now() });
  return exists;
}

const os = implement({ project: projectContract }).$context<AppContext>();

export const projectRouter = os.project.router({
  list: os.project.list.handler(({ context }) => {
    return context.projectStore.getAll().map((p) => ({
      ...p,
      pathMissing: !pathExists(p.path),
    }));
  }),

  create: os.project.create.handler(({ input, context }) => {
    log("create project", { path: input.path, name: input.name });
    const existing = context.projectStore.findByPath(input.path);
    if (existing) {
      log("project already exists, updating lastAccessedAt", { id: existing.id });
      context.projectStore.update(existing.id, { lastAccessedAt: new Date().toISOString() });
      return { ...existing, lastAccessedAt: new Date().toISOString() };
    }

    const project = {
      id: randomUUID(),
      name: input.name ?? path.basename(input.path),
      path: input.path,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };
    log("adding new project", { id: project.id, name: project.name });
    context.projectStore.add(project);
    return project;
  }),

  open: os.project.open.handler(({ input, context }) => {
    log("open project", { path: input.path });
    if (!existsSync(input.path)) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Directory does not exist: ${input.path}`,
      });
    }
    const existing = context.projectStore.findByPath(input.path);
    if (existing) {
      log("project already exists, activating", { id: existing.id });
      context.projectStore.update(existing.id, { lastAccessedAt: new Date().toISOString() });
      context.projectStore.setActive(existing.id);
      return { ...existing, lastAccessedAt: new Date().toISOString() };
    }

    const project = {
      id: randomUUID(),
      name: path.basename(input.path),
      path: input.path,
      createdAt: new Date().toISOString(),
      lastAccessedAt: new Date().toISOString(),
    };
    log("adding and activating new project", { id: project.id, name: project.name });
    context.projectStore.add(project);
    context.projectStore.setActive(project.id);
    return project;
  }),

  remove: os.project.remove.handler(({ input, context }) => {
    log("remove project", { id: input.id });
    context.projectStore.remove(input.id);
  }),

  setActive: os.project.setActive.handler(({ input, context }) => {
    log("set active project", { id: input.id });
    if (input.id !== null) {
      const project = context.projectStore.get(input.id);
      if (project && !existsSync(project.path)) {
        throw new ORPCError("BAD_REQUEST", {
          message: `Project directory does not exist: ${project.path}`,
        });
      }
    }
    context.projectStore.setActive(input.id);
  }),

  getActive: os.project.getActive.handler(({ context }) => {
    const project = context.projectStore.getActive();
    if (project && !existsSync(project.path)) {
      log("active project path missing, clearing: %s", project.path);
      context.projectStore.setActive(null);
      return null;
    }
    return project;
  }),

  pickDirectory: os.project.pickDirectory.handler(async () => {
    log("opening directory picker");
    const win = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      log("directory picker canceled");
      return null;
    }
    log("directory selected", { path: result.filePaths[0] });
    return { path: result.filePaths[0] };
  }),

  getArchivedSessions: os.project.getArchivedSessions.handler(({ context }) => {
    return context.projectStore.getArchivedSessions();
  }),

  archiveSession: os.project.archiveSession.handler(({ input, context }) => {
    log("archive session", { projectPath: input.projectPath, sessionId: input.sessionId });
    context.projectStore.archiveSession(input.projectPath, input.sessionId);
  }),

  getPinnedSessions: os.project.getPinnedSessions.handler(({ context }) => {
    return context.projectStore.getPinnedSessions();
  }),

  togglePinSession: os.project.togglePinSession.handler(({ input, context }) => {
    log("toggle pin session", { projectPath: input.projectPath, sessionId: input.sessionId });
    context.projectStore.togglePinSession(input.projectPath, input.sessionId);
  }),

  getClosedAccordions: os.project.getClosedAccordions.handler(({ context }) => {
    return context.projectStore.getClosedProjectAccordions();
  }),

  setClosedAccordions: os.project.setClosedAccordions.handler(({ input, context }) => {
    context.projectStore.setClosedProjectAccordions(input.ids);
  }),

  reorderProjects: os.project.reorderProjects.handler(({ input, context }) => {
    log("reorder projects", { projectIds: input.projectIds });
    context.projectStore.reorder(input.projectIds);
  }),
});
