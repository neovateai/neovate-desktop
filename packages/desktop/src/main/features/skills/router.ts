import { ORPCError, implement } from "@orpc/server";
import debug from "debug";
import { shell } from "electron";

import type { AppContext } from "../../router";

import { skillsContract } from "../../../shared/features/skills/contract";

const log = debug("neovate:skills:router");

const os = implement({ skills: skillsContract }).$context<AppContext>();

/** Wrap service errors as ORPCError so messages survive oRPC serialization in production. */
function wrapError(e: unknown, fallback: string): never {
  const message = e instanceof Error ? e.message : fallback;
  log("handler error: %s", message);
  throw new ORPCError("BAD_GATEWAY", { defined: true, message });
}

export const skillsRouter = os.skills.router({
  list: os.skills.list.handler(async ({ input, context }) => {
    try {
      return await context.skillsService.list(input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to list skills");
    }
  }),

  getContent: os.skills.getContent.handler(async ({ input, context }) => {
    try {
      return await context.skillsService.getContent(input.dirName, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to read skill content");
    }
  }),

  recommended: os.skills.recommended.handler(async ({ input, context }) => {
    try {
      return await context.skillsService.recommended(input.forceRefresh);
    } catch (e) {
      wrapError(e, "Failed to fetch recommended skills");
    }
  }),

  preview: os.skills.preview.handler(async ({ input, context }) => {
    try {
      return await context.skillsService.preview(input.source);
    } catch (e) {
      wrapError(e, "Failed to preview skill source");
    }
  }),

  install: os.skills.install.handler(async ({ input, context }) => {
    try {
      await context.skillsService.install(
        input.sourceRef,
        input.skillName,
        input.scope,
        input.projectPath,
      );
    } catch (e) {
      wrapError(e, "Failed to install skill");
    }
  }),

  installFromPreview: os.skills.installFromPreview.handler(async ({ input, context }) => {
    try {
      await context.skillsService.installFromPreview(
        input.previewId,
        input.selectedSkills,
        input.scope,
        input.projectPath,
      );
    } catch (e) {
      wrapError(e, "Failed to install skills from preview");
    }
  }),

  remove: os.skills.remove.handler(async ({ input, context }) => {
    try {
      await context.skillsService.remove(input.dirName, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to remove skill");
    }
  }),

  enable: os.skills.enable.handler(async ({ input, context }) => {
    try {
      await context.skillsService.enable(input.dirName, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to enable skill");
    }
  }),

  disable: os.skills.disable.handler(async ({ input, context }) => {
    try {
      await context.skillsService.disable(input.dirName, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to disable skill");
    }
  }),

  openFolder: os.skills.openFolder.handler(async ({ input, context }) => {
    // Resolve the skill directory path securely on the backend
    const skills = await context.skillsService.list(input.scope, input.projectPath);
    const skill = skills.find((s) => s.dirName === input.dirName);
    if (skill) {
      shell.showItemInFolder(skill.dirPath);
    }
  }),

  exists: os.skills.exists.handler(async ({ input, context }) => {
    try {
      return await context.skillsService.exists(input.dirName, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to check skill existence");
    }
  }),

  cancelPreview: os.skills.cancelPreview.handler(async ({ input, context }) => {
    try {
      await context.skillsService.cancelPreview(input.previewId);
    } catch (e) {
      wrapError(e, "Failed to cancel preview");
    }
  }),

  checkUpdates: os.skills.checkUpdates.handler(async ({ input, context }) => {
    try {
      return await context.skillsService.checkUpdates(input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to check for skill updates");
    }
  }),

  update: os.skills.update.handler(async ({ input, context }) => {
    try {
      await context.skillsService.update(input.dirName, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to update skill");
    }
  }),
});
