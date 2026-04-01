import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type {
  InstalledPlugin,
  Marketplace,
  MarketplacePlugin,
  PluginError,
  PluginUpdate,
} from "./types";

const scopeSchema = z.enum(["user", "project", "local"]);

export const pluginsContract = {
  listInstalled: oc.input(z.object({})).output(type<InstalledPlugin[]>()),

  enable: oc.input(z.object({ pluginId: z.string() })).output(type<void>()),

  disable: oc.input(z.object({ pluginId: z.string() })).output(type<void>()),

  uninstall: oc.input(z.object({ pluginId: z.string(), scope: scopeSchema })).output(type<void>()),

  update: oc.input(z.object({ pluginId: z.string(), scope: scopeSchema })).output(type<void>()),

  getReadme: oc
    .input(z.object({ pluginId: z.string(), scope: scopeSchema }))
    .output(type<string | null>()),

  checkUpdates: oc.input(z.object({})).output(type<PluginUpdate[]>()),

  updateAll: oc.input(z.object({})).output(type<{ updated: number }>()),

  listMarketplaces: oc.input(z.object({})).output(type<Marketplace[]>()),

  addMarketplace: oc.input(z.object({ source: z.string() })).output(type<Marketplace>()),

  removeMarketplace: oc.input(z.object({ name: z.string() })).output(type<void>()),

  updateMarketplace: oc.input(z.object({ name: z.string() })).output(type<Marketplace>()),

  browseMarketplace: oc
    .input(z.object({ marketplace: z.string() }))
    .output(type<MarketplacePlugin[]>()),

  discoverAll: oc
    .input(z.object({ search: z.string().optional() }))
    .output(type<MarketplacePlugin[]>()),

  install: oc
    .input(
      z.object({
        pluginName: z.string(),
        marketplace: z.string(),
        scope: scopeSchema.default("user"),
      }),
    )
    .output(type<InstalledPlugin>()),

  getErrors: oc.input(z.object({})).output(type<PluginError[]>()),
};
