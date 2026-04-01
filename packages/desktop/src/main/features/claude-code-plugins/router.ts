import { ORPCError, implement } from "@orpc/server";
import debug from "debug";

import type { AppContext } from "../../router";

import { pluginsContract } from "../../../shared/features/claude-code-plugins/contract";

const log = debug("neovate:plugins:router");

const os = implement({ plugins: pluginsContract }).$context<AppContext>();

function wrapError(e: unknown, fallback: string): never {
  const message = e instanceof Error ? e.message : fallback;
  log("handler error: %s", message);
  throw new ORPCError("BAD_GATEWAY", { defined: true, message });
}

export const pluginsRouter = os.plugins.router({
  listInstalled: os.plugins.listInstalled.handler(async ({ context }) => {
    try {
      return await context.pluginsService.listInstalled();
    } catch (e) {
      wrapError(e, "Failed to list installed plugins");
    }
  }),

  enable: os.plugins.enable.handler(async ({ input, context }) => {
    try {
      await context.pluginsService.enable(input.pluginId);
    } catch (e) {
      wrapError(e, "Failed to enable plugin");
    }
  }),

  disable: os.plugins.disable.handler(async ({ input, context }) => {
    try {
      await context.pluginsService.disable(input.pluginId);
    } catch (e) {
      wrapError(e, "Failed to disable plugin");
    }
  }),

  uninstall: os.plugins.uninstall.handler(async ({ input, context }) => {
    try {
      await context.pluginsService.uninstall(input.pluginId, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to uninstall plugin");
    }
  }),

  update: os.plugins.update.handler(async ({ input, context }) => {
    try {
      await context.pluginsService.update(input.pluginId, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to update plugin");
    }
  }),

  getReadme: os.plugins.getReadme.handler(async ({ input, context }) => {
    try {
      return await context.pluginsService.getReadme(input.pluginId, input.scope, input.projectPath);
    } catch (e) {
      wrapError(e, "Failed to get plugin README");
    }
  }),

  checkUpdates: os.plugins.checkUpdates.handler(async ({ context }) => {
    try {
      return await context.pluginsService.checkUpdates();
    } catch (e) {
      wrapError(e, "Failed to check for plugin updates");
    }
  }),

  updateAll: os.plugins.updateAll.handler(async ({ context }) => {
    try {
      return await context.pluginsService.updateAll();
    } catch (e) {
      wrapError(e, "Failed to update all plugins");
    }
  }),

  listMarketplaces: os.plugins.listMarketplaces.handler(async ({ context }) => {
    try {
      return await context.pluginsService.listMarketplaces();
    } catch (e) {
      wrapError(e, "Failed to list marketplaces");
    }
  }),

  addMarketplace: os.plugins.addMarketplace.handler(async ({ input, context }) => {
    try {
      return await context.pluginsService.addMarketplace(input.source);
    } catch (e) {
      wrapError(e, "Failed to add marketplace");
    }
  }),

  removeMarketplace: os.plugins.removeMarketplace.handler(async ({ input, context }) => {
    try {
      await context.pluginsService.removeMarketplace(input.name);
    } catch (e) {
      wrapError(e, "Failed to remove marketplace");
    }
  }),

  updateMarketplace: os.plugins.updateMarketplace.handler(async ({ input, context }) => {
    try {
      return await context.pluginsService.updateMarketplace(input.name);
    } catch (e) {
      wrapError(e, "Failed to update marketplace");
    }
  }),

  browseMarketplace: os.plugins.browseMarketplace.handler(async ({ input, context }) => {
    try {
      return await context.pluginsService.browseMarketplace(input.marketplace);
    } catch (e) {
      wrapError(e, "Failed to browse marketplace");
    }
  }),

  discoverAll: os.plugins.discoverAll.handler(async ({ input, context }) => {
    try {
      return await context.pluginsService.discoverAll(input.search);
    } catch (e) {
      wrapError(e, "Failed to discover plugins");
    }
  }),

  install: os.plugins.install.handler(async ({ input, context }) => {
    try {
      return await context.pluginsService.install(
        input.pluginName,
        input.marketplace,
        input.scope,
        input.projectPath,
      );
    } catch (e) {
      wrapError(e, "Failed to install plugin");
    }
  }),

  getErrors: os.plugins.getErrors.handler(({ context }) => {
    return context.pluginsService.getErrors();
  }),
});
