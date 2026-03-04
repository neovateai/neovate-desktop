import { oc, type } from "@orpc/contract";
import { z } from "zod";
import { claudeContract } from "./features/claude/contract";
import { configContract } from "./features/config/contract";
import { projectContract } from "./features/project/contract";
import { utilsContract } from "./features/utils/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  claude: claudeContract,
  config: configContract,
  project: projectContract,
  utils: utilsContract,
  window: {
    ensureWidth: oc.input(z.object({ minWidth: z.number() })),
  },
};
