import { oc, type } from "@orpc/contract";
import { z } from "zod";
import { acpContract } from "./features/acp/contract";
import { projectContract } from "./features/project/contract";
import { utilsContract } from "./features/utils/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  acp: acpContract,
  project: projectContract,
  utils: utilsContract,
  window: {
    ensureWidth: oc.input(z.object({ minWidth: z.number() })),
  },
};
