import { oc, type } from "@orpc/contract";
import { z } from "zod";

import { agentContract } from "./features/agent/contract";
import { configContract } from "./features/config/contract";
import { projectContract } from "./features/project/contract";
import { providerContract } from "./features/provider/contract";
import { storageContract } from "./features/storage/contract";
import { updaterContract } from "./features/updater/contract";
import { utilsContract } from "./features/utils/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  agent: agentContract,
  config: configContract,
  project: projectContract,
  provider: providerContract,
  storage: storageContract,
  updater: updaterContract,
  utils: utilsContract,
  window: {
    ensureWidth: oc.input(z.object({ minWidth: z.number() })),
    open: oc.input(
      z.object({
        windowType: z.string(),
        width: z.number().optional(),
        height: z.number().optional(),
        title: z.string().optional(),
        parent: z.boolean().optional(),
        urlSearchParams: z.record(z.string(), z.string()).optional(),
      }),
    ),
  },
};
