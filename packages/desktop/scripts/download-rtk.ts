/**
 * Download the RTK (Rust Token Killer) binary for the target platform into vendor/rtk/.
 *
 * Usage:
 *   bun scripts/download-rtk.ts                              # current platform
 *   bun scripts/download-rtk.ts --platform darwin --arch arm64
 */
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const SCRIPT_DIR = import.meta.dirname!;
const DESKTOP_DIR = join(SCRIPT_DIR, "..");
const VENDOR_DIR = join(DESKTOP_DIR, "vendor", "rtk");
const RTK_PATH = join(VENDOR_DIR, "rtk");

/** Pinned RTK version — update this when upgrading. */
const RTK_VERSION = "0.30.0";

const RTK_TARGETS: Record<string, Record<string, string>> = {
  darwin: {
    arm64: "rtk-aarch64-apple-darwin",
    x64: "rtk-x86_64-apple-darwin",
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
  const target = RTK_TARGETS[platform]?.[arch];
  if (!target) throw new Error(`Unsupported platform/arch: ${platform}/${arch}`);

  if (await Bun.file(RTK_PATH).exists()) {
    try {
      const existingVersion = verifyRtk(RTK_PATH);
      if (existingVersion === RTK_VERSION) {
        console.log(`rtk ${RTK_VERSION} already exists at ${RTK_PATH}, skipping download`);
        return;
      }
      console.log(`rtk ${existingVersion} exists at ${RTK_PATH}, replacing with ${RTK_VERSION}`);
    } catch {
      console.log(`Existing rtk binary invalid, re-downloading ${RTK_VERSION}`);
    }
  }

  const tarName = `${target}.tar.gz`;
  const baseUrl = `https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}`;

  console.log(`Downloading rtk v${RTK_VERSION} for ${platform}/${arch}...`);

  const [tarRes, shaRes] = await Promise.all([
    fetch(`${baseUrl}/${tarName}`),
    fetch(`${baseUrl}/checksums.txt`),
  ]);

  if (!tarRes.ok) throw new Error(`Failed to download ${tarName}: ${tarRes.status}`);
  if (!shaRes.ok) throw new Error(`Failed to download checksums.txt: ${shaRes.status}`);

  const tarBuffer = await tarRes.arrayBuffer();
  const shaText = await shaRes.text();
  const expected = shaText
    .split("\n")
    .find((line) => line.includes(tarName))
    ?.trim()
    .split(/\s+/)[0];

  if (!expected) {
    throw new Error(`No checksum found for ${tarName} in checksums.txt`);
  }

  const actual = new Bun.CryptoHasher("sha256").update(tarBuffer).digest("hex");
  if (actual !== expected) {
    throw new Error(`SHA256 mismatch: expected ${expected}, got ${actual}`);
  }
  console.log("  SHA256 verified");

  mkdirSync(VENDOR_DIR, { recursive: true });
  const tmpTar = join(VENDOR_DIR, tarName);
  await Bun.write(tmpTar, tarBuffer);

  try {
    const proc = Bun.spawnSync(["tar", "-xzf", tmpTar, "-C", VENDOR_DIR]);
    if (proc.exitCode !== 0) {
      throw new Error(
        `tar extract failed: ${proc.stderr.toString().trim() || proc.stdout.toString().trim()}`,
      );
    }
  } finally {
    rmSync(tmpTar, { force: true });
  }

  chmodSync(RTK_PATH, 0o755);

  // Only verify when building for the current architecture
  if (platform === process.platform && arch === process.arch) {
    verifyRtk(RTK_PATH, RTK_VERSION);
  }

  console.log(`  Done: ${RTK_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
