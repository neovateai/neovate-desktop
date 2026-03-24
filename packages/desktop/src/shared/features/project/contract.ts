import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type { Project, ProjectInfo } from "./types";

export const projectContract = {
  list: oc.output(type<ProjectInfo[]>()),

  create: oc
    .input(z.object({ path: z.string(), name: z.string().optional() }))
    .output(type<Project>()),

  open: oc.input(z.object({ path: z.string() })).output(type<Project>()),

  remove: oc.input(z.object({ id: z.string() })).output(type<void>()),

  setActive: oc.input(z.object({ id: z.nullable(z.string()) })).output(type<void>()),

  getActive: oc.output(type<Project | null>()),

  pickDirectory: oc.output(type<{ path: string } | null>()),

  getArchivedSessions: oc.output(type<Record<string, string[]>>()),

  archiveSession: oc
    .input(z.object({ projectPath: z.string(), sessionId: z.string() }))
    .output(type<void>()),

  getPinnedSessions: oc.output(type<Record<string, string[]>>()),

  togglePinSession: oc
    .input(z.object({ projectPath: z.string(), sessionId: z.string() }))
    .output(type<void>()),

  getClosedAccordions: oc.output(type<string[]>()),

  setClosedAccordions: oc.input(z.object({ ids: z.array(z.string()) })).output(type<void>()),

  reorderProjects: oc.input(z.object({ projectIds: z.array(z.string()) })).output(type<void>()),
};
