import { implement } from "@orpc/server";
import { shell } from "electron";

import type { AppContext } from "../../router";

import { skillsContract } from "../../../shared/features/skills/contract";

const os = implement({ skills: skillsContract }).$context<AppContext>();

export const skillsRouter = os.skills.router({
  list: os.skills.list.handler(({ input, context }) => {
    return context.skillsService.list(input.scope, input.projectPath);
  }),

  getContent: os.skills.getContent.handler(({ input, context }) => {
    return context.skillsService.getContent(input.name, input.scope, input.projectPath);
  }),

  recommended: os.skills.recommended.handler(({ input, context }) => {
    return context.skillsService.recommended(input.forceRefresh);
  }),

  preview: os.skills.preview.handler(({ input, context }) => {
    return context.skillsService.preview(input.source);
  }),

  install: os.skills.install.handler(({ input, context }) => {
    return context.skillsService.install(
      input.sourceRef,
      input.skillName,
      input.scope,
      input.projectPath,
    );
  }),

  installFromPreview: os.skills.installFromPreview.handler(({ input, context }) => {
    return context.skillsService.installFromPreview(
      input.previewId,
      input.selectedSkills,
      input.scope,
      input.projectPath,
    );
  }),

  remove: os.skills.remove.handler(({ input, context }) => {
    return context.skillsService.remove(input.name, input.scope, input.projectPath);
  }),

  enable: os.skills.enable.handler(({ input, context }) => {
    return context.skillsService.enable(input.name, input.scope, input.projectPath);
  }),

  disable: os.skills.disable.handler(({ input, context }) => {
    return context.skillsService.disable(input.name, input.scope, input.projectPath);
  }),

  openFolder: os.skills.openFolder.handler(async ({ input, context }) => {
    // Resolve the skill directory path securely on the backend
    const skills = await context.skillsService.list(input.scope, input.projectPath);
    const skill = skills.find((s) => s.name === input.name);
    if (skill) {
      shell.showItemInFolder(skill.dirPath);
    }
  }),

  exists: os.skills.exists.handler(({ input, context }) => {
    return context.skillsService.exists(input.name, input.scope, input.projectPath);
  }),

  cancelPreview: os.skills.cancelPreview.handler(({ input, context }) => {
    return context.skillsService.cancelPreview(input.previewId);
  }),

  checkUpdates: os.skills.checkUpdates.handler(({ input, context }) => {
    return context.skillsService.checkUpdates(input.scope, input.projectPath);
  }),

  update: os.skills.update.handler(({ input, context }) => {
    return context.skillsService.update(input.name, input.scope, input.projectPath);
  }),
});
