import { eventIterator, oc, type } from "@orpc/contract";
import { z } from "zod";

import type { PlatformConfig, PlatformStatus, PlatformStatusEvent } from "./types";

export const remoteControlContract = {
  getPlatforms: oc.output(type<PlatformStatus[]>()),

  configurePlatform: oc
    .input(z.object({ platformId: z.string(), config: z.record(z.string(), z.unknown()) }))
    .output(type<void>()),

  togglePlatform: oc
    .input(z.object({ platformId: z.string(), enabled: z.boolean() }))
    .output(type<void>()),

  getPlatformConfig: oc.input(z.object({ platformId: z.string() })).output(type<PlatformConfig>()),

  testConnection: oc
    .input(z.object({ platformId: z.string() }))
    .output(type<{ ok: boolean; error?: string; botUsername?: string }>()),

  startPairing: oc.input(z.object({ platformId: z.string() })).output(type<void>()),
  stopPairing: oc.input(z.object({ platformId: z.string() })).output(type<void>()),

  approvePairing: oc
    .input(z.object({ platformId: z.string(), chatId: z.string() }))
    .output(type<void>()),

  rejectPairing: oc
    .input(z.object({ platformId: z.string(), chatId: z.string() }))
    .output(type<void>()),

  subscribeStatus: oc.output(eventIterator(type<PlatformStatusEvent>())),
};
