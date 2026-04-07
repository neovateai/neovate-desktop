import { implement } from "@orpc/server";
import debug from "debug";

import type { AppContext } from "../../router";

import { remoteControlContract } from "../../../shared/features/remote-control/contract";

const log = debug("neovate:remote-control:router");
const os = implement({ remoteControl: remoteControlContract }).$context<AppContext>();

export const remoteControlRouter = os.remoteControl.router({
  getPlatforms: os.remoteControl.getPlatforms.handler(({ context }) => {
    return context.remoteControlService.getPlatforms();
  }),

  configurePlatform: os.remoteControl.configurePlatform.handler(async ({ input, context }) => {
    log("configurePlatform: %s", input.platformId);
    context.remoteControlService.saveConfig(input.platformId, input.config);
    await context.remoteControlService.onConfigChanged(input.platformId);
  }),

  togglePlatform: os.remoteControl.togglePlatform.handler(async ({ input, context }) => {
    log("togglePlatform: %s enabled=%s", input.platformId, input.enabled);
    const existing = context.remoteControlService.loadConfig(input.platformId) ?? {};
    context.remoteControlService.saveConfig(input.platformId, {
      ...existing,
      enabled: input.enabled,
    });
    await context.remoteControlService.onConfigChanged(input.platformId);
  }),

  getPlatformConfig: os.remoteControl.getPlatformConfig.handler(({ input, context }) => {
    return context.remoteControlService.getPlatformConfig(input.platformId);
  }),

  testConnection: os.remoteControl.testConnection.handler(async ({ input, context }) => {
    return context.remoteControlService.testConnection(input.platformId);
  }),

  startPairing: os.remoteControl.startPairing.handler(async ({ input, context }) => {
    await context.remoteControlService.startPairing(input.platformId);
  }),

  stopPairing: os.remoteControl.stopPairing.handler(async ({ input, context }) => {
    await context.remoteControlService.stopPairing(input.platformId);
  }),

  approvePairing: os.remoteControl.approvePairing.handler(async ({ input, context }) => {
    await context.remoteControlService.approvePairing(input.platformId, input.chatId);
  }),

  rejectPairing: os.remoteControl.rejectPairing.handler(async ({ input, context }) => {
    await context.remoteControlService.rejectPairing(input.platformId, input.chatId);
  }),

  subscribeStatus: os.remoteControl.subscribeStatus.handler(async function* ({ context, signal }) {
    const queue: Array<
      import("../../../shared/features/remote-control/types").PlatformStatusEvent
    > = [];
    let resolve: (() => void) | null = null;

    const unsub = context.remoteControlService.onStatus((event) => {
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
