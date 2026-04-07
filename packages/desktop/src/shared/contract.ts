import { oc, type } from "@orpc/contract";
import { z } from "zod";

import { agentContract } from "./features/agent/contract";
import { analyticsContract } from "./features/analytics/contract";
import { pluginsContract } from "./features/claude-code-plugins/contract";
import { configContract } from "./features/config/contract";
import { deeplinkContract } from "./features/deeplink/contract";
import { electronContract } from "./features/electron/contract";
import { llmContract } from "./features/llm/contract";
import { projectContract } from "./features/project/contract";
import { providerContract } from "./features/provider/contract";
import { remoteControlContract } from "./features/remote-control/contract";
import { rulesContract } from "./features/rules/contract";
import { skillsContract } from "./features/skills/contract";
import { storageContract } from "./features/storage/contract";
import { updaterContract } from "./features/updater/contract";
import { utilsContract } from "./features/utils/contract";
import { changesContract } from "./plugins/changes/contract";
import { gitContract } from "./plugins/git/contract";

export const contract = {
  ping: oc.output(type<"pong">()),
  analytics: analyticsContract,
  agent: agentContract,
  deeplink: deeplinkContract,
  config: configContract,
  electron: electronContract,
  llm: llmContract,
  remoteControl: remoteControlContract,
  project: projectContract,
  provider: providerContract,
  rules: rulesContract,
  plugins: pluginsContract,
  skills: skillsContract,
  storage: storageContract,
  updater: updaterContract,
  utils: utilsContract,
  git: gitContract,
  changes: changesContract,
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
