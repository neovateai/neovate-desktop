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
    return await delay(1000); // FIXME: 插件关闭侧边栏有延迟，先这样处理，后面可能用魔改产物的方式强制屏蔽
  } catch (e) {
    log("code server starter failed: %s", e);
  }
}

function delay(ms: number = 1000): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
