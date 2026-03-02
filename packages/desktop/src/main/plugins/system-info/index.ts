import { app } from "electron";
import type { MainPlugin } from "../../core/plugin/types";

export default {
  name: "systemInfo",
  configContributions: ({ orpcServer }) => ({
    router: orpcServer.router({
      getInfo: orpcServer.handler(() => ({
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.versions.node,
        electronVersion: process.versions.electron ?? "",
        appVersion: app.getVersion(),
      })),
    }),
  }),
} satisfies MainPlugin;
