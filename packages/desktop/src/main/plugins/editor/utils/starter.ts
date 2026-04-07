import debug from "debug";
import path from "node:path";

import { getCodeServerBinaryPath } from "./constants";

const log = debug("neovate:editor:starter");

/**
 * 基于code server 产物进行调用启动
 */
export async function codeServerStarter(opts: { port: number; extDir: string; dataDir: string }) {
  const { port, extDir, dataDir } = opts;
  log("starting code server", { port, extDir, dataDir });
  try {
    const resourcePath = getCodeServerBinaryPath();
    const wrapperJS = path.join(resourcePath, "out", "node", "wrapper.js");
    const cliJS = path.join(resourcePath, "out", "node", "cli.js");
    const { wrapper } = await import(wrapperJS);
    const { setDefaults } = await import(cliJS);
    const functionArgs = {
      port,
      host: "127.0.0.1",
      auth: "none",
      "extensions-dir": extDir,
      "user-data-dir": dataDir,
      "disable-update-check": true,
      "disable-workspace-trust": true,
      "disable-telemetry": true,
    };
    const mergedArgs = await setDefaults(functionArgs);
    await wrapper.start(mergedArgs);
  } catch (e) {
    log("code server starter failed: %s", e);
  }
}
