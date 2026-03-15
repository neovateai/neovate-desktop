import debug from "debug";
import { spawn } from "node:child_process";
import os from "node:os";

const log = debug("neovate:terminal:shell-env");

/**
 * Options for shell environment extraction.
 */
export interface ShellEnvOptions {
  /** Timeout in milliseconds, default 5000 */
  timeout?: number;
  /** Shell path to use for extraction, auto-detected if not specified */
  shell?: string;
}

/**
 * Service for extracting shell environment variables.
 *
 * Spawns a login shell and captures its environment to ensure
 * terminals have the same PATH and configuration as the user's
 * native terminal (Terminal.app, iTerm2, etc.).
 */
export class ShellEnvService {
  readonly #platform: NodeJS.Platform;
  readonly #cache = new Map<string, Record<string, string>>();
  readonly #pending = new Map<string, Promise<Record<string, string>>>();
  #detectedShell: string | null = null;

  constructor() {
    this.#platform = os.platform();
  }

  /**
   * Get the detected shell path for this platform.
   */
  getShell(): string {
    if (this.#detectedShell) {
      return this.#detectedShell;
    }

    this.#detectedShell = this.#detectShell();
    return this.#detectedShell;
  }

  /**
   * Extract environment from the user's login shell.
   * Results are cached per shell path.
   */
  async getEnvironment(options: ShellEnvOptions = {}): Promise<Record<string, string>> {
    const { shell = this.getShell(), timeout = 5000 } = options;
    const cacheKey = `${shell}:${timeout}`;

    // Return cached result if available
    if (this.#cache.has(cacheKey)) {
      log("returning cached environment", { shell });
      return this.#cache.get(cacheKey)!;
    }

    // Return pending promise if extraction is in progress
    if (this.#pending.has(cacheKey)) {
      log("extraction already in progress, reusing pending promise", { shell });
      return this.#pending.get(cacheKey)!;
    }

    log("extracting shell environment", { shell, timeout });
    // Extract and cache
    const promise = this.#extractEnvironment(shell, timeout).then((env) => {
      log("shell environment extracted", { shell, keys: Object.keys(env).length });
      this.#cache.set(cacheKey, env);
      this.#pending.delete(cacheKey);
      return env;
    });

    this.#pending.set(cacheKey, promise);
    return promise;
  }

  /**
   * Get cached environment synchronously.
   * Returns undefined if not yet cached (use getEnvironment for initial extraction).
   */
  getEnvironmentSync(): Record<string, string> | undefined {
    const shell = this.getShell();
    const cacheKey = `${shell}:5000`;
    return this.#cache.get(cacheKey);
  }

  /**
   * Invalidate cached environment.
   * Call this when user modifies shell config files.
   */
  invalidateCache(): void {
    this.#cache.clear();
    this.#pending.clear();
  }

  /**
   * Detect the appropriate shell for the current platform.
   */
  #detectShell(): string {
    // macOS only (per design doc)
    if (this.#platform !== "darwin") {
      log("platform %s not fully supported, using fallback shell", this.#platform);
      return process.env.SHELL || "/bin/sh";
    }

    // Use SHELL environment variable (respects user's default shell)
    if (process.env.SHELL) {
      return process.env.SHELL;
    }

    // Fallback to zsh (macOS default since Catalina)
    return "/bin/zsh";
  }

  /**
   * Extract environment by spawning a login shell.
   */
  #extractEnvironment(shell: string, timeout: number): Promise<Record<string, string>> {
    return new Promise((resolve) => {
      const env: Record<string, string> = {};

      // Get shell name to determine login flag
      const shellName = shell.split("/").pop() || "";
      const loginFlag = this.#getLoginFlag(shellName);

      // Spawn login shell to capture real environment
      const child = spawn(shell, [loginFlag, "-c", "env"], {
        stdio: ["ignore", "pipe", "pipe"],
        timeout,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        if (code === 0) {
          // Parse KEY=VALUE format from env output
          for (const line of stdout.split("\n")) {
            const eqIndex = line.indexOf("=");
            if (eqIndex > 0) {
              const key = line.slice(0, eqIndex);
              const value = line.slice(eqIndex + 1);
              env[key] = value;
            }
          }
          resolve(env);
        } else {
          // Fallback to process.env on failure
          log("extraction failed (exit %d): %s", code, stderr.trim());
          resolve(process.env as Record<string, string>);
        }
      });

      child.on("error", (error) => {
        log("extraction error: %s", error.message);
        resolve(process.env as Record<string, string>);
      });
    });
  }

  /**
   * Get the appropriate login flag for the shell.
   */
  #getLoginFlag(shellName: string): string {
    // All these shells support -l for login shell
    if (["zsh", "bash", "sh", "ksh"].includes(shellName)) {
      return "-l";
    }
    // fish uses -l as well
    if (shellName === "fish") {
      return "-l";
    }
    // Default fallback
    return "-l";
  }
}
