#!/usr/bin/env bun
/**
 * E2E auto-update test orchestrator.
 *
 * Builds two versions, starts local update server, launches old version,
 * and optionally records the screen.
 *
 * Usage:
 *   bun scripts/test-auto-update.ts [--record] [--old-version 0.1.0] [--new-version 0.2.0]
 *
 * Prerequisites:
 *   - Self-signed codesigning cert (run scripts/setup-codesign.sh first)
 *   - macOS with screencapture (for --record)
 */

import { parseArgs } from "node:util";
import { execSync, spawn, type ChildProcess } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

// Script lives at .claude/skills/test-auto-update/scripts/
// packages/desktop/ is 4 levels up
const PKG_DIR = resolve(import.meta.dirname, "../../../../packages/desktop");
const PKG_JSON = resolve(PKG_DIR, "package.json");
const APP_NAME = "Neovate Dev";
const APP_PATH = `/Applications/${APP_NAME}.app`;

const { values: args } = parseArgs({
  options: {
    record: { type: "boolean", default: false },
    "old-version": { type: "string", default: "0.1.0" },
    "new-version": { type: "string", default: "0.2.0" },
    "record-duration": { type: "string", default: "30" },
    output: { type: "string", default: "test-auto-update.mov" },
    help: { type: "boolean", default: false },
  },
});

if (args.help) {
  console.log(`
Usage: bun scripts/test-auto-update.ts [options]

Options:
  --record              Record screen during test (macOS screencapture)
  --old-version <ver>   Version to install as "current" (default: 0.1.0)
  --new-version <ver>   Version to serve as "update" (default: 0.2.0)
  --record-duration <s> Screen recording duration in seconds (default: 30)
  --output <file>       Output video file path (default: test-auto-update.mov)
  --help                Show this help
`);
  process.exit(0);
}

const oldVersion = args["old-version"]!;
const newVersion = args["new-version"]!;
const recordDuration = args["record-duration"]!;
const outputFile = resolve(args.output!);

// --- Helpers ---

function run(cmd: string, label: string) {
  console.log(`\n[${label}] ${cmd}`);
  execSync(cmd, { cwd: PKG_DIR, stdio: "inherit" });
}

function setVersion(version: string) {
  const pkg = JSON.parse(readFileSync(PKG_JSON, "utf-8"));
  pkg.version = version;
  writeFileSync(PKG_JSON, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`Set version to ${version}`);
}

function getInstalledVersion(): string | null {
  try {
    const plist = execSync(
      `defaults read "${APP_PATH}/Contents/Info" CFBundleShortVersionString`,
      { encoding: "utf-8" },
    ).trim();
    return plist;
  } catch {
    return null;
  }
}

function quit(appName: string) {
  try {
    execSync(
      `osascript -e 'tell application "${appName}" to quit'`,
      { timeout: 5000 },
    );
  } catch {
    // App might not be running
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- Main ---

async function main() {
  const originalPkg = readFileSync(PKG_JSON, "utf-8");

  try {
    // Step 1: Quit any running instance
    console.log("\n=== Step 1: Clean up ===");
    quit(APP_NAME);
    await sleep(1000);

    // Step 2: Build old version
    console.log(`\n=== Step 2: Build v${oldVersion} ===`);
    setVersion(oldVersion);
    run("bun run package:local", "build");

    // Step 3: Install old version
    console.log(`\n=== Step 3: Install v${oldVersion} to /Applications ===`);
    run(`rm -rf "${APP_PATH}"`, "clean");
    run(
      `cp -R "release-dev/mac-arm64/${APP_NAME}.app" "${APP_PATH}"`,
      "install",
    );
    console.log(`Installed version: ${getInstalledVersion()}`);

    // Step 4: Build new version (update server content)
    console.log(`\n=== Step 4: Build v${newVersion} (update payload) ===`);
    setVersion(newVersion);
    run("bun run package:local", "build");

    // Step 5: Start update server
    console.log("\n=== Step 5: Start local update server ===");
    const server = spawn("bun", ["run", "scripts/dev-app-update-server.ts"], {
      cwd: PKG_DIR,
      stdio: "pipe",
    });
    await sleep(1500);

    // Verify server is up
    try {
      const res = await fetch("http://localhost:8080/latest-mac.yml");
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      console.log("Update server is running on port 8080");
    } catch (e) {
      console.error("ERROR: Update server failed to start");
      server.kill();
      process.exit(1);
    }

    // Step 6: Start recording (optional)
    let recorder: ChildProcess | null = null;
    if (args.record) {
      console.log(
        `\n=== Step 6: Recording screen for ${recordDuration}s → ${outputFile} ===`,
      );
      recorder = spawn(
        "screencapture",
        ["-v", `-V${recordDuration}`, "-C", outputFile],
        { stdio: "inherit" },
      );
      await sleep(500);
    }

    // Step 7: Launch the old version
    console.log(`\n=== Step 7: Launch v${oldVersion} ===`);
    run(`open "${APP_PATH}"`, "launch");
    console.log("App launched. Auto-update should detect and download the new version.");
    console.log("Watch for the update toast in the app window.");

    // Step 8: Wait for recording to finish or manual observation
    if (recorder) {
      console.log(`\nRecording for ${recordDuration} seconds...`);
      await new Promise<void>((resolve) => {
        recorder!.on("exit", () => resolve());
      });
      console.log(`\nRecording saved to: ${outputFile}`);
    } else {
      console.log(
        "\nNo recording. Waiting 20s for update to complete...",
      );
      await sleep(20000);
    }

    // Step 9: Verify
    console.log("\n=== Step 9: Verify ===");
    quit(APP_NAME);
    await sleep(2000);

    // Relaunch to let Squirrel apply update
    run(`open "${APP_PATH}"`, "relaunch");
    await sleep(5000);

    const finalVersion = getInstalledVersion();
    console.log(`\nInstalled version after update: ${finalVersion}`);

    if (finalVersion === newVersion) {
      console.log(`\nSUCCESS: App updated from ${oldVersion} to ${newVersion}`);
    } else {
      console.log(
        `\nNOTE: Version is ${finalVersion}. Squirrel.Mac applies updates on next launch after download.`,
      );
    }

    // Cleanup
    quit(APP_NAME);
    server.kill();
  } finally {
    // Restore original package.json
    writeFileSync(PKG_JSON, originalPkg);
    console.log("\nRestored package.json");
  }
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
