import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type { PreviewSkill, RecommendedSkill, SkillMeta, SkillUpdate } from "./types";

const scopeSchema = z.enum(["global", "project"]);
const allScopeSchema = z.enum(["all", "global", "project"]);
const skillIdentifier = z.object({
  dirName: z.string(),
  scope: scopeSchema,
  projectPath: z.string().optional(),
});

export const skillsContract = {
  list: oc
    .input(z.object({ scope: allScopeSchema, projectPath: z.string().optional() }))
    .output(type<SkillMeta[]>()),

  getContent: oc.input(skillIdentifier).output(type<string>()),

  recommended: oc
    .input(z.object({ forceRefresh: z.boolean().optional() }))
    .output(type<RecommendedSkill[]>()),

  preview: oc
    .input(z.object({ source: z.string() }))
    .output(type<{ previewId: string; skills: PreviewSkill[] }>()),

  install: oc
    .input(
      z.object({
        sourceRef: z.string(),
        skillName: z.string(),
        scope: scopeSchema,
        projectPath: z.string().optional(),
      }),
    )
    .output(type<void>()),

  installFromPreview: oc
    .input(
      z.object({
        previewId: z.string(),
        selectedSkills: z.array(z.string()),
        scope: scopeSchema,
        projectPath: z.string().optional(),
      }),
    )
    .output(type<void>()),

  remove: oc.input(skillIdentifier).output(type<void>()),

  enable: oc.input(skillIdentifier).output(type<void>()),

  disable: oc.input(skillIdentifier).output(type<void>()),

  openFolder: oc.input(skillIdentifier).output(type<void>()),

  exists: oc.input(skillIdentifier).output(type<boolean>()),

  cancelPreview: oc.input(z.object({ previewId: z.string() })).output(type<void>()),

  checkUpdates: oc
    .input(z.object({ scope: allScopeSchema, projectPath: z.string().optional() }))
    .output(type<SkillUpdate[]>()),

  update: oc.input(skillIdentifier).output(type<void>()),
};
