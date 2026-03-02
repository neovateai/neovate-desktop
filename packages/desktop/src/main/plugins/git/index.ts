import { execFile } from "child_process";
import { promisify } from "util";
import type { MainPlugin } from "../../core/plugin/types";

const execFileAsync = promisify(execFile);

async function run(args: string[], cwd?: string): Promise<string> {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

export default {
  name: "git",
  configContributions: ({ orpcServer }) => ({
    router: orpcServer.router({
      status: orpcServer.handler(async () => {
        try {
          const [branch, ahead, behind, shortStat] = await Promise.all([
            run(["rev-parse", "--abbrev-ref", "HEAD"]),
            run(["rev-list", "--count", "HEAD@{u}..HEAD"]).catch(() => "0"),
            run(["rev-list", "--count", "HEAD..HEAD@{u}"]).catch(() => "0"),
            run(["diff", "--shortstat", "HEAD"]).catch(() => ""),
          ]);

          // Parse "3 files changed, 10 insertions(+), 2 deletions(-)"
          const changed = Number(shortStat.match(/(\d+) file/)?.[1] ?? 0);

          return {
            branch,
            ahead: Number(ahead),
            behind: Number(behind),
            changed,
          };
        } catch {
          return { branch: null, ahead: 0, behind: 0, changed: 0 };
        }
      }),
    }),
  }),
} satisfies MainPlugin;
