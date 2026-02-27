import { oc, type } from "@orpc/contract";
import { acpContract } from "./features/acp/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  acp: acpContract,
};
