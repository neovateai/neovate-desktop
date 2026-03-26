import debug from "debug";
import fs from "node:fs";
import path from "node:path";
import git from "simple-git";

import type { GitBranch, GitBranchFile } from "../../../shared/plugins/git/contract";
import type { PluginContext } from "../../core/plugin/types";

const log = debug("neovate:git");

const GIT_TIMEOUT_MS = 10_000;

function parseNumstat(output: string): Map<string, { insertions: number; deletions: number }> {
  const stats = new Map<string, { insertions: number; deletions: number }>();
  for (const line of output.trim().split("\n")) {
    if (!line) continue;
    const [ins, del, ...parts] = line.split("\t");
    const file = parts.join("\t");
    if (!file || ins === "-") continue; // skip binary files
    stats.set(file, { insertions: Number(ins), deletions: Number(del) });
  }
  return stats;
}

function str2file(cwd: string, file: string) {
  return {
    fullPath: path.resolve(cwd, file),
    relPath: file,
    fileName: path.basename(file),
    extName: path.extname(file).replace(".", ""),
  };
}

export function createGitRouter(orpcServer: PluginContext["orpcServer"]) {
  return orpcServer.router({
    files: orpcServer.handler(async ({ input }) => {
      const { cwd } = input as { cwd: string };
      log("files: fetching working and staged files", { cwd });
      try {
        const { working, staged } = await getFiles(cwd);
        log("files: done", { working: working.length, staged: staged.length });
        return { success: true, data: { working, staged } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    add: orpcServer.handler(async ({ input }) => {
      const { cwd, files } = input as { cwd: string; files: string[] };
      log("add: staging files", { cwd, files });
      try {
        const gitClient = git(cwd);
        await gitClient.add(files);
        return { success: true, data: {} };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    reset: orpcServer.handler(async ({ input }) => {
      const { cwd, files } = input as { cwd: string; files: string[] };
      log("reset: unstaging files", { cwd, files });
      try {
        const gitClient = git(cwd);
        await gitClient.reset(["HEAD", ...files]);

        return { success: true, data: {} };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    checkout: orpcServer.handler(async ({ input }) => {
      const { cwd, files } = input as { cwd: string; files: string[] };
      log("checkout: restoring files", { cwd, files });
      try {
        const gitClient = git(cwd);
        await gitClient.checkout(files);

        return { success: true, data: {} };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    diff: orpcServer.handler(async ({ input }) => {
      const {
        cwd,
        file,
        type: diffType,
      } = input as { cwd: string; file: string; type: "working" | "staged" };
      log("diff: loading", { cwd, file, diffType });
      try {
        const gitClient = git(cwd);

        let oldContent = "";
        let newContent = "";
        let fileStatus = "";

        try {
          const status = await gitClient.status();

          if (status.not_added.includes(file)) {
            fileStatus = "untracked";
          } else if (status.created.includes(file)) {
            fileStatus = "added";
          } else if (status.modified.includes(file)) {
            fileStatus = "modified";
          } else if (status.deleted.includes(file)) {
            fileStatus = "deleted";
          }
          log("diff: file status determined", { file, fileStatus });

          if (diffType === "staged") {
            try {
              newContent = await gitClient.show([`:${file}`]);
            } catch {
              newContent = "";
            }

            try {
              oldContent = await gitClient.show([`HEAD:${file}`]);
            } catch {
              oldContent = "";
            }
          } else {
            const filePath = path.resolve(cwd, file);

            try {
              newContent = fs.readFileSync(filePath, "utf8");
            } catch {
              newContent = "";
            }

            try {
              const isStaged = status.staged.includes(file);

              if (isStaged) {
                oldContent = await gitClient.show([`:${file}`]);
              } else {
                oldContent = await gitClient.show([`HEAD:${file}`]);
              }
            } catch {
              oldContent = "";
            }
          }
        } catch (error) {
          console.error("Error reading file contents:", error);
        }

        return {
          success: true,
          data: {
            oldContent: oldContent || "",
            newContent: newContent || "",
            fileStatus,
          },
        };
      } catch (error) {
        console.error("Error in diff handler:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    branches: orpcServer.handler(async ({ input }) => {
      const { cwd, search, limit } = input as {
        cwd: string;
        search?: string;
        limit?: number;
      };
      log("branches: listing", { cwd, search, limit });
      try {
        const result = await withTimeout(getBranches(cwd, search, limit), GIT_TIMEOUT_MS);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    checkoutBranch: orpcServer.handler(async ({ input }) => {
      const { cwd, branch } = input as { cwd: string; branch: string };
      log("checkoutBranch: switching", { cwd, branch });
      try {
        const result = await withTimeout(checkoutBranch(cwd, branch), GIT_TIMEOUT_MS);
        log("checkoutBranch: done", { branch, stashed: result.data?.stashed });
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    createBranch: orpcServer.handler(async ({ input }) => {
      const { cwd, name } = input as { cwd: string; name: string };
      log("createBranch: creating", { cwd, name });
      try {
        const result = await withTimeout(createBranch(cwd, name), GIT_TIMEOUT_MS);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    branchFiles: orpcServer.handler(async ({ input }) => {
      const { cwd } = input as { cwd: string };
      log("branchFiles: fetching", { cwd });
      try {
        const result = await withTimeout(getBranchFiles(cwd), GIT_TIMEOUT_MS);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    branchFileDiff: orpcServer.handler(async ({ input }) => {
      const { cwd, file } = input as { cwd: string; file: string };
      log("branchFileDiff: fetching", { cwd, file });
      try {
        const result = await withTimeout(getBranchFileDiff(cwd, file), GIT_TIMEOUT_MS);
        return result;
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
  });
}

/**
 * Get both working and staged files in a single git status call.
 * Uses status.files which contains:
 * - index: staged status (M=modified, A=added, D=deleted, R=renamed, C=copied)
 * - working_dir: working tree status (M=modified, D=deleted, ?=untracked)
 */
async function getFiles(cwd: string) {
  const gitClient = git(cwd);
  const [status, numstatWorkingRaw, numstatStagedRaw] = await Promise.all([
    gitClient.status(),
    gitClient.raw(["diff", "--numstat"]).catch(() => ""),
    gitClient.raw(["diff", "--cached", "--numstat"]).catch(() => ""),
  ]);
  const workingStats = parseNumstat(numstatWorkingRaw);
  const stagedStats = parseNumstat(numstatStagedRaw);

  const working: Array<
    ReturnType<typeof str2file> & { status: string; insertions?: number; deletions?: number }
  > = [];
  const staged: Array<
    ReturnType<typeof str2file> & {
      status: string;
      staged: true;
      insertions?: number;
      deletions?: number;
    }
  > = [];
  const seenWorking = new Set<string>();
  const seenStaged = new Set<string>();

  for (const file of status.files) {
    const indexStatus = file.index;
    const workTreeStatus = file.working_dir;
    const filePath = file.path;

    // Handle staged files (index status)
    if (indexStatus !== " " && indexStatus !== "?") {
      if (!seenStaged.has(filePath)) {
        seenStaged.add(filePath);
        let st: string;
        if (indexStatus === "A") st = "added";
        else if (indexStatus === "D") st = "deleted";
        else if (indexStatus === "R" || indexStatus === "C") st = "added";
        else st = "modified";

        const ss = stagedStats.get(filePath);
        staged.push({
          ...str2file(cwd, filePath),
          status: st,
          staged: true as const,
          ...(ss && { insertions: ss.insertions, deletions: ss.deletions }),
        });
      }
    }

    // Handle working tree files (working_dir status)
    // A file can be both staged AND have working changes
    if (workTreeStatus !== " " && workTreeStatus !== "?") {
      if (!seenWorking.has(filePath)) {
        seenWorking.add(filePath);
        let st: string;
        if (workTreeStatus === "D") st = "deleted";
        else st = "modified";

        const ws = workingStats.get(filePath);
        working.push({
          ...str2file(cwd, filePath),
          status: st,
          ...(ws && { insertions: ws.insertions, deletions: ws.deletions }),
        });
      }
    }

    // Handle untracked files (workTreeStatus = "?")
    if (workTreeStatus === "?") {
      if (!seenWorking.has(filePath)) {
        seenWorking.add(filePath);
        const us = workingStats.get(filePath);
        working.push({
          ...str2file(cwd, filePath),
          status: "untracked",
          ...(us && { insertions: us.insertions, deletions: us.deletions }),
        });
      }
    }
  }

  return { working, staged };
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Git operation timed out")), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function getRecentBranches(cwd: string, max: number): Promise<string[]> {
  const gitClient = git(cwd);
  try {
    const reflog = await gitClient.raw([
      "reflog",
      "show",
      "--format=%gs",
      "--no-abbrev",
      `-n`,
      "200",
    ]);
    const seen = new Set<string>();
    const recent: string[] = [];
    for (const line of reflog.split("\n")) {
      // reflog entries like "checkout: moving from X to Y"
      const match = line.match(/checkout: moving from .+ to (.+)/);
      if (!match) continue;
      const branch = match[1];
      if (seen.has(branch)) continue;
      seen.add(branch);
      recent.push(branch);
      if (recent.length >= max) break;
    }
    return recent;
  } catch {
    return [];
  }
}

async function getBranches(cwd: string, search?: string, limit?: number) {
  const gitClient = git(cwd);
  const branchSummary = await gitClient.branchLocal();
  const recentNames = await getRecentBranches(cwd, 5);

  let branches: GitBranch[] = Object.values(branchSummary.branches).map((b) => ({
    name: b.name,
    current: b.current,
    tracking: b.label?.match(/\[(.+?)[\]:]/)?.[1],
  }));

  // Populate ahead/behind via status for current branch
  try {
    const status = await gitClient.status();
    const currentBranch = branches.find((b) => b.current);
    if (currentBranch) {
      currentBranch.ahead = status.ahead;
      currentBranch.behind = status.behind;
    }
  } catch {
    // ignore
  }

  // Tag recent branches with timestamp-like ordering (index-based)
  for (const b of branches) {
    const idx = recentNames.indexOf(b.name);
    if (idx !== -1) {
      b.lastCommitTimestamp = -idx; // negative so most recent = highest value
    }
  }

  // Filter by search
  if (search) {
    const lower = search.toLowerCase();
    branches = branches.filter((b) => b.name.toLowerCase().includes(lower));
  }

  // Apply limit
  if (limit && limit > 0) {
    // Sort by recency first, then alphabetical
    branches.sort((a, b) => {
      const aRecent = a.lastCommitTimestamp != null ? 1 : 0;
      const bRecent = b.lastCommitTimestamp != null ? 1 : 0;
      if (aRecent !== bRecent) return bRecent - aRecent;
      if (aRecent && bRecent) return (b.lastCommitTimestamp ?? 0) - (a.lastCommitTimestamp ?? 0);
      return a.name.localeCompare(b.name);
    });
    branches = branches.slice(0, limit);
  }

  // Detect detached HEAD
  let current: string | null = branchSummary.current;
  let detachedHead: string | undefined;
  if (!current || current === "" || branchSummary.detached) {
    current = null;
    try {
      const rev = await gitClient.revparse(["--short", "HEAD"]);
      detachedHead = rev.trim();
    } catch {
      detachedHead = "unknown";
    }
  }

  return {
    success: true,
    data: { current, detachedHead, branches },
  };
}

async function checkoutBranch(cwd: string, branch: string) {
  const gitClient = git(cwd);
  const status = await gitClient.status();
  const isDirty =
    status.modified.length > 0 ||
    status.deleted.length > 0 ||
    status.created.length > 0 ||
    status.not_added.length > 0 ||
    status.staged.length > 0;

  let stashed = false;
  if (isDirty) {
    log("checkoutBranch: working tree dirty, stashing changes", { branch });
    await gitClient.stash([
      "push",
      "-m",
      `neovate-auto-stash: switching to ${branch}`,
      "--include-untracked",
    ]);
    stashed = true;
  }

  await gitClient.checkout(branch);

  let stashPopFailed = false;
  if (stashed) {
    try {
      await gitClient.stash(["pop"]);
    } catch {
      log("checkoutBranch: stash pop failed after switching to %s", branch);
      stashPopFailed = true;
    }
  }

  return { success: true, data: { stashed, stashPopFailed } };
}

async function createBranch(cwd: string, name: string) {
  const gitClient = git(cwd);
  await gitClient.checkoutLocalBranch(name);
  return { success: true, data: { name } };
}

async function getBranchFiles(cwd: string) {
  const gitClient = git(cwd);

  // Check for detached HEAD
  let local: string;
  try {
    local = (await gitClient.raw(["branch", "--show-current"])).trim();
    if (!local) {
      return { success: false, error: "detached_head" };
    }
  } catch {
    return { success: false, error: "detached_head" };
  }

  // Get tracking branch
  let tracking: string;
  try {
    tracking = (await gitClient.raw(["rev-parse", "--abbrev-ref", "@{u}"])).trim();
  } catch {
    return { success: false, error: "no_upstream" };
  }

  // Check tracking branch still exists
  try {
    await gitClient.raw(["rev-parse", "--verify", tracking]);
  } catch {
    return { success: false, error: "remote_gone" };
  }

  // Get ahead/behind
  let ahead = 0;
  let behind = 0;
  try {
    const revList = (
      await gitClient.raw(["rev-list", "--left-right", "--count", `${tracking}...HEAD`])
    ).trim();
    const [b, a] = revList.split("\t").map(Number);
    behind = b;
    ahead = a;
  } catch {
    // ignore
  }

  // Get merge-base so we diff "since fork point" including uncommitted changes
  let mergeBase: string;
  try {
    mergeBase = (await gitClient.raw(["merge-base", tracking, "HEAD"])).trim();
  } catch {
    mergeBase = tracking;
  }

  // Get changed files (merge-base vs working tree)
  const files: GitBranchFile[] = [];
  try {
    const [nameStatus, numstatRaw] = await Promise.all([
      gitClient.raw(["diff", "--name-status", mergeBase]),
      gitClient.raw(["diff", "--numstat", mergeBase]).catch(() => ""),
    ]);
    const branchStats = parseNumstat(numstatRaw);
    for (const line of nameStatus.trim().split("\n")) {
      if (!line) continue;
      const [statusChar, ...fileParts] = line.split("\t");
      const filePath = fileParts.join("\t");
      if (!filePath) continue;
      let status: "added" | "modified" | "deleted" = "modified";
      if (statusChar === "A") status = "added";
      else if (statusChar === "D") status = "deleted";
      const bs = branchStats.get(filePath);
      files.push({
        relPath: filePath,
        fileName: path.basename(filePath),
        extName: path.extname(filePath).replace(".", ""),
        status,
        ...(bs && { insertions: bs.insertions, deletions: bs.deletions }),
      });
    }
  } catch {
    // no diff available
  }

  return { success: true, data: { local, tracking, ahead, behind, files } };
}

async function getBranchFileDiff(cwd: string, file: string) {
  const gitClient = git(cwd);

  let tracking: string;
  try {
    tracking = (await gitClient.raw(["rev-parse", "--abbrev-ref", "@{u}"])).trim();
  } catch {
    return { success: false, error: "no_upstream" };
  }

  // Use merge-base for oldContent so we compare from the fork point
  let mergeBase: string;
  try {
    mergeBase = (await gitClient.raw(["merge-base", tracking, "HEAD"])).trim();
  } catch {
    mergeBase = tracking;
  }

  let oldContent = "";
  let newContent = "";

  try {
    oldContent = await gitClient.show([`${mergeBase}:${file}`]);
  } catch {
    // new file on branch
    oldContent = "";
  }

  // Read from working tree to include uncommitted changes
  try {
    newContent = fs.readFileSync(path.resolve(cwd, file), "utf8");
  } catch {
    // deleted file on branch
    newContent = "";
  }

  return {
    success: true,
    data: {
      oldContent,
      newContent,
      fileStatus: oldContent === "" ? "added" : newContent === "" ? "deleted" : "modified",
    },
  };
}
