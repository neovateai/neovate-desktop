#!/usr/bin/env bun
/**
 * Set version in packages/desktop/package.json.
 *
 * Usage: bun .claude/skills/test-auto-update/scripts/set-version.ts <version>
 * Example: bun .claude/skills/test-auto-update/scripts/set-version.ts 0.1.0
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("Usage: set-version.ts <version>");
  process.exit(1);
}

const pkgPath = resolve(import.meta.dirname, "../../../../packages/desktop/package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
const oldVersion = pkg.version;
pkg.version = version;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
console.log(`${oldVersion} → ${version}`);
