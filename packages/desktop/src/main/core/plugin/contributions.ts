import type { AnyRouter } from "@orpc/server";

import type { PluginContributions } from "./types";

export type Contributions = {
  routers: Map<string, AnyRouter>;
};

export function buildContributions(
  items: ({ name: string } & PluginContributions)[],
): Contributions {
  const routers = new Map<string, AnyRouter>();
  for (const { name, router } of items) {
    if (router) routers.set(name, router);
  }
  return { routers };
}

export const EMPTY_CONTRIBUTIONS: Contributions = { routers: new Map() };
