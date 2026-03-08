/**
 * Replace @/ alias imports with relative imports in shadcn UI components.
 *
 * Usage: bun .claude/skills/coss-ui-sync/scripts/fix-imports.ts
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const RENDERER_SRC = join(process.cwd(), "src/renderer/src");

const DIRS_TO_FIX = ["components/ui", "components/ai-elements", "lib", "hooks"] as const;

function resolveRelative(fromDir: string, aliasPath: string): string {
  // aliasPath e.g. "@/components/ui/button" or "@/lib/utils"
  const resolved = aliasPath.replace(/^@\//, "");
  const fromParts = fromDir.split("/");
  const toParts = resolved.split("/");

  // Find common prefix to simplify the relative path
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }

  const remainingUps = fromParts.length - common;
  const remainingPath = toParts.slice(common).join("/");

  if (remainingUps === 0) {
    return "./" + remainingPath;
  }
  return "../".repeat(remainingUps) + remainingPath;
}

async function fixFile(filePath: string, relativeDir: string): Promise<boolean> {
  const content = await readFile(filePath, "utf-8");
  const fixed = content.replace(/from ["']@\/([^"']+)["']/g, (_match, aliasPath) => {
    const relative = resolveRelative(relativeDir, `@/${aliasPath}`);
    return `from "${relative}"`;
  });

  if (fixed !== content) {
    await writeFile(filePath, fixed);
    console.log(`  fixed: ${relativeDir}/${filePath.split("/").pop()}`);
    return true;
  }
  return false;
}

async function main() {
  let totalFixed = 0;

  for (const dir of DIRS_TO_FIX) {
    const fullDir = join(RENDERER_SRC, dir);
    let entries: string[];
    try {
      entries = await readdir(fullDir);
    } catch {
      continue;
    }

    const files = entries.filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));
    for (const file of files) {
      const fixed = await fixFile(join(fullDir, file), dir);
      if (fixed) totalFixed++;
    }
  }

  console.log(`\nDone. Fixed ${totalFixed} file(s).`);
}

main();
