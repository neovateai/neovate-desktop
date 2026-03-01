#!/usr/bin/env bun
import { $ } from "bun";
import { execSync } from "child_process";

async function main() {
  const args = process.argv.slice(2);
  const shouldBuild = args.includes("--build");
  const shouldRunE2E = args.includes("--e2e");

  console.log("🚀 Starting ready check...\n");

  // Step 1: Run format and check for git changes
  console.log("🎨 Running formatter...");
  try {
    await $`bun run format`.quiet();

    const gitStatus = execSync("git diff --name-only", { encoding: "utf-8" });
    if (gitStatus.trim()) {
      console.error("❌ Format check failed: There are unstaged changes after formatting");
      console.error("Changed files:");
      console.error(gitStatus);
      process.exit(1);
    }
    console.log("✅ Format check passed\n");
  } catch (error) {
    console.error("❌ Format check failed:", error);
    process.exit(1);
  }

  // Step 2: Run typecheck + lint + lint:format
  console.log("🔍 Running check...");
  try {
    await $`bun run check`.quiet();
    console.log("✅ Check passed\n");
  } catch (error) {
    console.error("❌ Check failed:", error);
    process.exit(1);
  }

  // Step 3: Build (only if --build flag is provided)
  if (shouldBuild) {
    console.log("📦 Building project...");
    try {
      await $`bun run build`.quiet();
      console.log("✅ Build completed successfully\n");
    } catch (error) {
      console.error("❌ Build failed:", error);
      process.exit(1);
    }
  }

  // Step 4: Run tests
  console.log("🧪 Running tests...");
  try {
    await $`bun run test:run`.quiet();
    console.log("✅ Tests passed\n");
  } catch (error) {
    console.error("❌ Tests failed:", error);
    process.exit(1);
  }

  // Step 5: Run e2e tests (only if --e2e flag is provided)
  if (shouldRunE2E) {
    console.log("🎭 Running e2e tests...");
    try {
      await $`bun run test:e2e`.quiet();
      console.log("✅ E2E tests passed\n");
    } catch (error) {
      console.error("❌ E2E tests failed:", error);
      process.exit(1);
    }
  }

  console.log("🎉 All checks passed! Project is ready.");
}

main().catch((error) => {
  console.error("❌ Unexpected error:", error);
  process.exit(1);
});
