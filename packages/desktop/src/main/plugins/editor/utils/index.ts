import debug from "debug";
import { execSync } from "node:child_process";

import { ExtensionBridgeServer } from "./bridge";

const log = debug("neovate:editor:manager");
import { CODE_SERVER_PORT, DATA_DIR, EXTENSION_BRIDGE_PORT, EXTENSIONS_DIR } from "./constants";
import { downloadCodeServer, isCodeServerInstalled, type ProgressCallback } from "./download";
import { injectStyle } from "./injector";
import { installExtension } from "./installer";
import { overrideCodeServerSettings } from "./settings";
import { codeServerStarter } from "./starter";

export class CodeServerStartError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(`Server start failed: ${message}`);
    this.name = "CodeServerStartError";
  }
}

export interface CodeServerInstance {
  url: string;
  stop: () => void;
}

/**
 * Kill any process running on the specified port
 */
function killProcessOnPort(port: number): void {
  try {
    if (process.platform === "win32") {
      // Windows
      const result = execSync(`netstat -ano | findstr :${port}`, {
        encoding: "utf-8",
      });
      const lines = result.trim().split("\n");
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && !Number.isNaN(Number(pid))) {
          try {
            execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
          } catch {
            // Process may have already exited
          }
        }
      }
    } else {
      // macOS / Linux
      execSync(`lsof -ti:${port} | xargs kill -9 2>/dev/null || true`, {
        stdio: "ignore",
      });
    }
  } catch {
    // No process on port, or kill failed - that's fine
  }
}

/**
 * Singleton manager for code-server instance
 */
export class CodeServerManager {
  private instance: CodeServerInstance | null = null;
  private startPromise: Promise<CodeServerInstance> | null = null;

  /**
   * Start or get existing code-server instance
   */
  async start(
    bridge: ExtensionBridgeServer,
    onProgress?: ProgressCallback,
  ): Promise<CodeServerInstance> {
    if (this.instance) {
      log("returning existing instance", { url: this.instance.url });
      return this.instance;
    }

    if (this.startPromise) {
      log("waiting for in-progress start");
      return this.startPromise;
    }

    log("starting new code-server instance");
    this.startPromise = this.doStart(bridge, onProgress)
      .then((instance) => {
        this.instance = instance;
        this.startPromise = null;
        return instance;
      })
      .catch((error) => {
        this.startPromise = null;
        throw error;
      });

    return this.startPromise;
  }

  private async doStart(
    bridge: ExtensionBridgeServer,
    onProgress?: ProgressCallback,
  ): Promise<CodeServerInstance> {
    log("doStart: checking installation");
    const installed = await isCodeServerInstalled();
    if (!installed) {
      await downloadCodeServer(onProgress);
    }
    // 2. Override settings for minimal UI
    await overrideCodeServerSettings();
    // 3. Kill any existing process on the port
    killProcessOnPort(CODE_SERVER_PORT);
    try {
      // code server extension bridge server
      const bridgePort = await bridge.start(EXTENSION_BRIDGE_PORT);
      process.env.NEOVATE_BRIDGE_PORT = String(bridgePort);
      // preset extension
      await installExtension();
      // overwrite vscode dist style
      injectStyle();
    } catch (e) {
      log("extension service failed", e);
    }

    try {
      // start code server
      await codeServerStarter({
        port: CODE_SERVER_PORT,
        extDir: EXTENSIONS_DIR,
        dataDir: DATA_DIR,
      });

      const url = `http://127.0.0.1:${CODE_SERVER_PORT}`;
      log("code server ready", { url });

      return {
        url,
        stop: () => {
          killProcessOnPort(CODE_SERVER_PORT);
        },
      };
    } catch (error) {
      throw new CodeServerStartError((error as Error).message, error as Error);
    }
  }

  /**
   * Get current status
   */
  getStatus(): { isRunning: boolean; url: string | null } {
    return {
      isRunning: this.instance !== null,
      url: this.instance?.url ?? null,
    };
  }

  /**
   * Stop the server
   */
  stop(): void {
    log("stopping code server");
    if (this.instance) {
      this.instance.stop();
      this.instance = null;
    }
    this.startPromise = null;
  }
}

export type { DownloadProgress, ProgressCallback } from "./download";
export type { ExtensionBridgeServer } from "./bridge";
