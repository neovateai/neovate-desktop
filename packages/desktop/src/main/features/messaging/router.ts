import { implement } from "@orpc/server";
import debug from "debug";

import type { AppContext } from "../../router";

import { messagingContract } from "../../../shared/features/messaging/contract";

const log = debug("neovate:messaging:router");
const os = implement({ messaging: messagingContract }).$context<AppContext>();

export const messagingRouter = os.messaging.router({
  getPlatforms: os.messaging.getPlatforms.handler(({ context }) => {
    return context.messagingService.getPlatforms();
  }),

  configurePlatform: os.messaging.configurePlatform.handler(async ({ input, context }) => {
    log("configurePlatform: %s", input.platformId);
    context.messagingService.saveConfig(input.platformId, input.config);
    await context.messagingService.onConfigChanged(input.platformId);
  }),

  togglePlatform: os.messaging.togglePlatform.handler(async ({ input, context }) => {
    log("togglePlatform: %s enabled=%s", input.platformId, input.enabled);
    const existing = context.messagingService.loadConfig(input.platformId) ?? {};
    context.messagingService.saveConfig(input.platformId, { ...existing, enabled: input.enabled });
    await context.messagingService.onConfigChanged(input.platformId);
  }),

  getPlatformConfig: os.messaging.getPlatformConfig.handler(({ input, context }) => {
    return context.messagingService.getPlatformConfig(input.platformId);
  }),

  testConnection: os.messaging.testConnection.handler(async ({ input, context }) => {
    return context.messagingService.testConnection(input.platformId);
  }),

  startPairing: os.messaging.startPairing.handler(async ({ input, context }) => {
    await context.messagingService.startPairing(input.platformId);
  }),

  stopPairing: os.messaging.stopPairing.handler(async ({ input, context }) => {
    await context.messagingService.stopPairing(input.platformId);
  }),

  approvePairing: os.messaging.approvePairing.handler(async ({ input, context }) => {
    await context.messagingService.approvePairing(input.platformId, input.chatId);
  }),

  rejectPairing: os.messaging.rejectPairing.handler(async ({ input, context }) => {
    await context.messagingService.rejectPairing(input.platformId, input.chatId);
  }),

  subscribeStatus: os.messaging.subscribeStatus.handler(async function* ({ context, signal }) {
    const queue: Array<import("../../../shared/features/messaging/types").PlatformStatusEvent> = [];
    let resolve: (() => void) | null = null;

    const unsub = context.messagingService.onStatus((event) => {
      queue.push(event);
      resolve?.();
    });

    const onAbort = () => resolve?.();
    signal?.addEventListener("abort", onAbort);

    try {
      while (!signal?.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
        while (queue.length > 0) {
          yield queue.shift()!;
        }
      }
    } finally {
      signal?.removeEventListener("abort", onAbort);
      unsub();
    }
  }),
});
