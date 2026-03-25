/**
 * Download the bun binary for the target platform into vendor/bun/.
 *
 * Usage:
 *   bun scripts/download-bun.ts                              # current platform
 *   bun scripts/download-bun.ts --platform darwin --arch arm64
 */
import { chmodSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

import { extractZip } from "./extract-zip";

const SCRIPT_DIR = import.meta.dirname!;
const DESKTOP_DIR = join(SCRIPT_DIR, "..");
const ROOT_PACKAGE_JSON = join(DESKTOP_DIR, "..", "..", "package.json");
const VENDOR_DIR = join(DESKTOP_DIR, "vendor", "bun");

const BUN_TARGETS: Record<string, Record<string, string>> = {
  darwin: { arm64: "bun-darwin-aarch64", x64: "bun-darwin-x64" },
  win32: { x64: "bun-windows-x64" },
  linux: { arm64: "bun-linux-aarch64", x64: "bun-linux-x64" },
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

async function getBunVersion(): Promise<string> {
  const { packageManager } = (await Bun.file(ROOT_PACKAGE_JSON).json()) as {
    packageManager?: string;
  };
  const version = packageManager?.match(/^bun@(.+)$/)?.[1];
  if (!version)
    throw new Error("Cannot find bun version in root package.json packageManager field");
  return version;
}

function verifyBun(binaryPath: string, expectedVersion?: string): string {
  const result = Bun.spawnSync([binaryPath, "--version"]);
  const output = result.stdout.toString().trim();
  const error = result.stderr.toString().trim();

  if (result.exitCode !== 0 || !output) {
    throw new Error(`bun verification failed: ${error || output || "no output"}`);
  }

  if (expectedVersion && output !== expectedVersion) {
    throw new Error(`bun version mismatch: expected ${expectedVersion}, got ${output}`);
  }

  console.log(`  Verified bun ${output}`);
  return output;
}

async function main() {
  const { platform, arch } = parseArgs();
  const isWin = platform === "win32";
  const binName = isWin ? "bun.exe" : "bun";
  const bunPath = join(VENDOR_DIR, binName);
  const target = BUN_TARGETS[platform]?.[arch];
  if (!target) throw new Error(`Unsupported platform/arch: ${platform}/${arch}`);

  const version = await getBunVersion();

  if (await Bun.file(bunPath).exists()) {
    const existingVersion = verifyBun(bunPath);
    if (existingVersion === version) {
      console.log(`bun ${version} already exists at ${bunPath}, skipping download`);
      return;
    }
    console.log(`bun ${existingVersion} exists at ${bunPath}, replacing with ${version}`);
  }

  const zipName = `${target}.zip`;
  const baseUrl = `https://github.com/oven-sh/bun/releases/download/bun-v${version}`;

  console.log(`Downloading bun v${version} for ${platform}/${arch}...`);

  const [zipRes, shaRes] = await Promise.all([
    fetch(`${baseUrl}/${zipName}`),
    fetch(`${baseUrl}/SHASUMS256.txt`),
  ]);

  if (!zipRes.ok) throw new Error(`Failed to download ${zipName}: ${zipRes.status}`);
  if (!shaRes.ok) throw new Error(`Failed to download SHASUMS256.txt: ${shaRes.status}`);

  const zipBuffer = await zipRes.arrayBuffer();
  const shaText = await shaRes.text();
  const expected = shaText
    .split("\n")
    .find((line) => line.includes(zipName))
    ?.trim()
    .split(/\s+/)[0];

  if (!expected) {
    throw new Error(`No checksum found for ${zipName} in SHASUMS256.txt`);
  }

  const actual = new Bun.CryptoHasher("sha256").update(zipBuffer).digest("hex");
  if (actual !== expected) {
    throw new Error(`SHA256 mismatch: expected ${expected}, got ${actual}`);
  }
  console.log("  SHA256 verified");

  mkdirSync(VENDOR_DIR, { recursive: true });
  const tmpZip = join(VENDOR_DIR, zipName);
  await Bun.write(tmpZip, zipBuffer);

  try {
    extractZip(tmpZip, VENDOR_DIR, `${target}/${binName}`);
  } finally {
    rmSync(tmpZip, { force: true });
  }

  if (!isWin) {
    chmodSync(bunPath, 0o755);
  }

  // Only verify when building for the current architecture (cross-compile can't run foreign binaries)
  if (platform === process.platform && arch === process.arch) {
    verifyBun(bunPath, version);
  }

  console.log(`  Done: ${bunPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
