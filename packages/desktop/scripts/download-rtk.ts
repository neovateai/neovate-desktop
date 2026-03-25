/**
 * Download the RTK (Rust Token Killer) binary for the target platform into vendor/rtk/.
 *
 * Usage:
 *   bun scripts/download-rtk.ts                              # current platform
 *   bun scripts/download-rtk.ts --platform darwin --arch arm64
 */
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { extractZip } from "./extract-zip";

const SCRIPT_DIR = import.meta.dirname!;
const DESKTOP_DIR = join(SCRIPT_DIR, "..");
const VENDOR_DIR = join(DESKTOP_DIR, "vendor", "rtk");

/** Pinned RTK version — update this when upgrading. */
const RTK_VERSION = "0.30.0";

const RTK_TARGETS: Record<string, Record<string, string>> = {
  darwin: {
    arm64: "rtk-aarch64-apple-darwin",
    x64: "rtk-x86_64-apple-darwin",
  },
  win32: {
    x64: "rtk-x86_64-pc-windows-msvc",
  },
  linux: {
    arm64: "rtk-aarch64-unknown-linux-gnu",
    x64: "rtk-x86_64-unknown-linux-gnu",
  },
};

function readFlag(args: string[], flag: string, fallback: string): string {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function parseArgs(): { platform: string; arch: string } {
  const args = process.argv.slice(2);
  return {
    platform: readFlag(args, "--platform", process.platform),
    arch: readFlag(args, "--arch", process.arch),
  };
}

function verifyRtk(binaryPath: string, expectedVersion?: string): string {
  const result = Bun.spawnSync([binaryPath, "--version"]);
  const output = result.stdout.toString().trim();
  const error = result.stderr.toString().trim();

  if (result.exitCode !== 0 || !output) {
    throw new Error(`rtk verification failed: ${error || output || "no output"}`);
  }

  // rtk --version outputs "rtk X.Y.Z"
  const version = output.replace(/^rtk\s+/, "");

  if (expectedVersion && version !== expectedVersion) {
    throw new Error(`rtk version mismatch: expected ${expectedVersion}, got ${version}`);
  }

  console.log(`  Verified rtk ${version}`);
  return version;
}

async function main() {
  const { platform, arch } = parseArgs();
  const isWin = platform === "win32";
  const binName = isWin ? "rtk.exe" : "rtk";
  const rtkPath = join(VENDOR_DIR, binName);
  const target = RTK_TARGETS[platform]?.[arch];
  if (!target) throw new Error(`Unsupported platform/arch: ${platform}/${arch}`);

  if (await Bun.file(rtkPath).exists()) {
    try {
      const existingVersion = verifyRtk(rtkPath);
      if (existingVersion === RTK_VERSION) {
        console.log(`rtk ${RTK_VERSION} already exists at ${rtkPath}, skipping download`);
        return;
      }
      console.log(`rtk ${existingVersion} exists at ${rtkPath}, replacing with ${RTK_VERSION}`);
    } catch {
      console.log(`Existing rtk binary invalid, re-downloading ${RTK_VERSION}`);
    }
  }

  const archiveName = isWin ? `${target}.zip` : `${target}.tar.gz`;
  const baseUrl = `https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}`;

  console.log(`Downloading rtk v${RTK_VERSION} for ${platform}/${arch}...`);

  const [archiveRes, shaRes] = await Promise.all([
    fetch(`${baseUrl}/${archiveName}`),
    fetch(`${baseUrl}/checksums.txt`),
  ]);

  if (!archiveRes.ok) throw new Error(`Failed to download ${archiveName}: ${archiveRes.status}`);
  if (!shaRes.ok) throw new Error(`Failed to download checksums.txt: ${shaRes.status}`);

  const archiveBuffer = await archiveRes.arrayBuffer();
  const shaText = await shaRes.text();
  const expected = shaText
    .split("\n")
    .find((line) => line.includes(archiveName))
    ?.trim()
    .split(/\s+/)[0];

  if (!expected) {
    throw new Error(`No checksum found for ${archiveName} in checksums.txt`);
  }

  const actual = new Bun.CryptoHasher("sha256").update(archiveBuffer).digest("hex");
  if (actual !== expected) {
    throw new Error(`SHA256 mismatch: expected ${expected}, got ${actual}`);
  }
  console.log("  SHA256 verified");

  mkdirSync(VENDOR_DIR, { recursive: true });
  const tmpArchive = join(VENDOR_DIR, archiveName);
  await Bun.write(tmpArchive, archiveBuffer);

  try {
    if (isWin) {
      extractZip(tmpArchive, VENDOR_DIR, binName);
    } else {
      const proc = Bun.spawnSync(["tar", "-xzf", tmpArchive, "-C", VENDOR_DIR]);
      if (proc.exitCode !== 0) {
        throw new Error(
          `tar extract failed: ${proc.stderr.toString().trim() || proc.stdout.toString().trim()}`,
        );
      }
    }
  } finally {
    rmSync(tmpArchive, { force: true });
  }

  if (!isWin) {
    chmodSync(rtkPath, 0o755);
  }

  // Only verify when building for the current architecture
  if (platform === process.platform && arch === process.arch) {
    verifyRtk(rtkPath, RTK_VERSION);
  }

  console.log(`  Done: ${rtkPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
