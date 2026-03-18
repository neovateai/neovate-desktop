/**
 * Bundle the fetch interceptor into a standalone JS file.
 * Output: resources/fetch-interceptor.js
 *
 * Uses Bun's built-in bundler — no extra dependencies needed.
 * Run: bun scripts/build-interceptor.ts
 */
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

const outdir = join(projectRoot, "resources");
mkdirSync(outdir, { recursive: true });

const result = await Bun.build({
  entrypoints: [join(projectRoot, "src/main/features/agent/interceptor/fetch-interceptor.ts")],
  outdir,
  naming: "fetch-interceptor.js",
  target: "node",
  format: "esm",
  minify: false,
  sourcemap: "none",
  external: [],
});

if (!result.success) {
  console.error("Build failed:");
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

console.log("Built fetch-interceptor →", join(outdir, "fetch-interceptor.js"));
