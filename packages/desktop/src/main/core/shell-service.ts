import debug from "debug";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

import { isWindows } from "../../shared/platform";

const log = debug("neovate:shell-env");

export function getSystemShell(): string {
  if (isWindows) {
    return process.env["COMSPEC"] || "cmd.exe";
  }

  let shell: string | undefined | null = process.env["SHELL"];

  if (!shell) {
    try {
      shell = os.userInfo().shell;
    } catch (_err) {
      // userInfo() can throw if user has no username or homedir
    }
  }

  if (!shell) {
    shell = "/bin/bash";
  }

  if (shell === "/bin/false") {
    shell = "/bin/bash";
  }

  return shell;
}

function resolveShellEnv(): Promise<Record<string, string>> {
  if (process.env["__RESOLVING_SHELL_ENVIRONMENT"]) {
    log("already inside a resolving shell — returning process.env");
    return Promise.resolve(process.env as Record<string, string>);
  }

  // On Windows, the environment is already inherited — no login-shell trick needed
  if (isWindows) {
    log("win32: returning process.env directly");
    return Promise.resolve(process.env as Record<string, string>);
  }

  return new Promise((resolve) => {
    const startTime = Date.now();
    const runAsNode = process.env["ELECTRON_RUN_AS_NODE"];
    const noAttach = process.env["ELECTRON_NO_ATTACH_CONSOLE"];

    const mark = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
    const regex = new RegExp(mark + "({.*})" + mark);

    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      ELECTRON_NO_ATTACH_CONSOLE: "1",
      __RESOLVING_SHELL_ENVIRONMENT: "1",
      DISABLE_AUTO_UPDATE: "true",
      ZSH_TMUX_AUTOSTARTED: "true",
    };

    const systemShell = getSystemShell();
    log("detected shell: %s", systemShell);

    const name = path.basename(systemShell);
    let command: string;
    let shellArgs: string[];
    const extraArgs = "";

    if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
      command = `& '${process.execPath}' ${extraArgs} -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`;
      shellArgs = ["-Login", "-Command"];
    } else if (name === "nu") {
      command = `^'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
      shellArgs = ["-i", "-l", "-c"];
    } else if (name === "xonsh") {
      command = `import os, json; print("${mark}" + json.dumps(dict(os.environ)) + "${mark}")`;
      shellArgs = ["-i", "-l", "-c"];
    } else {
      command = `'${process.execPath}' ${extraArgs} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;
      if (name === "tcsh" || name === "csh") {
        shellArgs = ["-ic"];
      } else {
        shellArgs = ["-i", "-l", "-c"];
      }
    }

    log("spawning: %s %s '%s'", systemShell, shellArgs.join(" "), command);

    const child = spawn(systemShell, [...shellArgs, command], {
      stdio: ["ignore", "pipe", "pipe"],
      env,
      detached: true,
    });
    child.unref();

    const timeout = setTimeout(() => {
      child.kill();
      log("ERROR: shell env resolution timed out after 10s");
      log("falling back to process.env");
      resolve(process.env as Record<string, string>);
    }, 10_000);

    child.on("error", (err) => {
      clearTimeout(timeout);
      log("ERROR: failed to spawn shell: %s", err.message);
      log("falling back to process.env");
      resolve(process.env as Record<string, string>);
    });

    const buffers: Buffer[] = [];
    child.stdout.on("data", (b: Buffer) => buffers.push(b));

    const stderr: Buffer[] = [];
    child.stderr.on("data", (b: Buffer) => stderr.push(b));

    child.on("close", (code, signal) => {
      clearTimeout(timeout);

      const raw = Buffer.concat(buffers).toString("utf8");
      const stderrStr = Buffer.concat(stderr).toString("utf8");

      if (stderrStr.trim()) {
        log("stderr: %s", stderrStr.trim());
      }

      if (code || signal) {
        log("ERROR: shell exited with code %s, signal %s", code, signal);
        log("falling back to process.env");
        resolve(process.env as Record<string, string>);
        return;
      }

      const match = regex.exec(raw);
      if (!match) {
        log("ERROR: could not find env markers in shell output");
        log("falling back to process.env");
        resolve(process.env as Record<string, string>);
        return;
      }
      const rawStripped = match[1];

      try {
        const resolved = JSON.parse(rawStripped);

        if (runAsNode) {
          resolved["ELECTRON_RUN_AS_NODE"] = runAsNode;
        } else {
          delete resolved["ELECTRON_RUN_AS_NODE"];
        }

        if (noAttach) {
          resolved["ELECTRON_NO_ATTACH_CONSOLE"] = noAttach;
        } else {
          delete resolved["ELECTRON_NO_ATTACH_CONSOLE"];
        }

        delete resolved["__RESOLVING_SHELL_ENVIRONMENT"];
        delete resolved["XDG_RUNTIME_DIR"];
        delete resolved["DISABLE_AUTO_UPDATE"];
        delete resolved["ZSH_TMUX_AUTOSTARTED"];

        const elapsed = Date.now() - startTime;
        log("resolved in %dms", elapsed);
        log("PATH: %s", resolved["PATH"]);
        log("env keys: %s", Object.keys(resolved).join(", "));

        resolve(resolved);
      } catch (err) {
        log(
          "ERROR: failed to parse shell env: %s",
          err instanceof Error ? err.message : String(err),
        );
        log("falling back to process.env");
        resolve(process.env as Record<string, string>);
      }
    });
  });
}

export interface IShellService {
  getEnv(): Promise<Record<string, string>>;
}

class ShellEnvironmentService implements IShellService {
  #cachedPromise: Promise<Record<string, string>> | null = null;

  getEnv(): Promise<Record<string, string>> {
    if (!this.#cachedPromise) {
      this.#cachedPromise = resolveShellEnv();
    }
    return this.#cachedPromise;
  }

  _resetForTesting(): void {
    this.#cachedPromise = null;
  }
}

export const shellEnvService = new ShellEnvironmentService();
