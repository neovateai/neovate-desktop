import { oc, type } from "@orpc/contract";
import { z } from "zod";

import type { RewindFilesResult } from "../../features/agent/types";

export interface ChangesDiffResponse {
  success: boolean;
  data?: {
    oldContent: string;
    newContent: string;
  };
  error?: string;
}

export const changesContract = {
  lastTurnFiles: oc.input(z.object({ sessionId: z.string() })).output(type<RewindFilesResult>()),
  lastTurnDiff: oc
    .input(z.object({ sessionId: z.string(), file: z.string() }))
    .output(type<ChangesDiffResponse>()),
};
