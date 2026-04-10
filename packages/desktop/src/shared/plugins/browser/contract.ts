import { oc, type } from "@orpc/contract";

export const browserContract = {
  attachDevTools: oc
    .input(type<{ sourceId: number; targetId: number }>())
    .output(type<{ success: boolean; error?: string }>()),
  detachDevTools: oc.input(type<{ sourceId: number }>()).output(type<{ success: boolean }>()),
};
