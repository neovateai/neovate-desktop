import { implement } from "@orpc/server";
import { dialog } from "electron";
import { randomUUID } from "node:crypto";
import path from "node:path";

import type { AppContext } from "../../router";

import { projectContract } from "../../../shared/features/project/contract";

const os = implement({ project: projectContract }).$context<AppContext>();

export const projectRouter = os.project.router({
  list: os.project.list.handler(({ context }) => {
    return context.projectStore.getAll();
  }),

  create: os.project.create.handler(({ input, context }) => {
    const existing = context.projectStore.findByPath(input.path);
    if (existing) {
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
    context.projectStore.add(project);
    return project;
  }),

  open: os.project.open.handler(({ input, context }) => {
    const existing = context.projectStore.findByPath(input.path);
    if (existing) {
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
    context.projectStore.add(project);
    context.projectStore.setActive(project.id);
    return project;
  }),

  remove: os.project.remove.handler(({ input, context }) => {
    context.projectStore.remove(input.id);
  }),

  setActive: os.project.setActive.handler(({ input, context }) => {
    context.projectStore.setActive(input.id);
  }),

  getActive: os.project.getActive.handler(({ context }) => {
    return context.projectStore.getActive();
  }),

  pickDirectory: os.project.pickDirectory.handler(async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return { path: result.filePaths[0] };
  }),

  getArchivedSessions: os.project.getArchivedSessions.handler(({ context }) => {
    return context.projectStore.getArchivedSessions();
  }),

  archiveSession: os.project.archiveSession.handler(({ input, context }) => {
    context.projectStore.archiveSession(input.projectPath, input.sessionId);
  }),

  getPinnedSessions: os.project.getPinnedSessions.handler(({ context }) => {
    return context.projectStore.getPinnedSessions();
  }),

  togglePinSession: os.project.togglePinSession.handler(({ input, context }) => {
    context.projectStore.togglePinSession(input.projectPath, input.sessionId);
  }),

  getClosedAccordions: os.project.getClosedAccordions.handler(({ context }) => {
    return context.projectStore.getClosedProjectAccordions();
  }),

  setClosedAccordions: os.project.setClosedAccordions.handler(({ input, context }) => {
    context.projectStore.setClosedProjectAccordions(input.ids);
  }),

  reorderProjects: os.project.reorderProjects.handler(({ input, context }) => {
    context.projectStore.reorder(input.projectIds);
  }),
});
