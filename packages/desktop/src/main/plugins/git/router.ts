import fs from "node:fs";
import path from "node:path";
import git from "simple-git";

import type { GitBranch, GitBranchFile } from "../../../shared/plugins/git/contract";
import type { PluginContext } from "../../core/plugin/types";

const GIT_TIMEOUT_MS = 10_000;

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
      try {
        const [working, staged] = await Promise.all([getWorkingFiles(cwd), getStagedFiles(cwd)]);

        return { success: true, data: { working, staged } };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error occurred",
        };
      }
    }),
    // 添加文件到暂存区
    add: orpcServer.handler(async ({ input }) => {
      const { cwd, files } = input as { cwd: string; files: string[] };
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
    // 取消暂存文件
    reset: orpcServer.handler(async ({ input }) => {
      const { cwd, files } = input as { cwd: string; files: string[] };
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
      try {
        const gitClient = git(cwd);

        let oldContent = "";
        let newContent = "";
        let fileStatus = "";

        try {
          // 获取文件状态信息
          const status = await gitClient.status();

          // 确定文件状态
          if (status.not_added.includes(file)) {
            fileStatus = "untracked";
          } else if (status.created.includes(file)) {
            fileStatus = "added";
          } else if (status.modified.includes(file)) {
            fileStatus = "modified";
          } else if (status.deleted.includes(file)) {
            fileStatus = "deleted";
          }

          if (diffType === "staged") {
            try {
              // 获取暂存区内容
              newContent = await gitClient.show([`:${file}`]);
            } catch {
              // 暂存区不存在（可能是删除）
              newContent = "";
            }

            // 获取 HEAD 版本
            try {
              oldContent = await gitClient.show([`HEAD:${file}`]);
            } catch {
              // HEAD 版本不存在（新文件）
              oldContent = "";
            }
          } else {
            // working: 比较 暂存区 vs 工作区
            const filePath = path.resolve(cwd, file);

            // 获取工作区内容
            try {
              newContent = fs.readFileSync(filePath, "utf8");
            } catch {
              // 文件不存在（可能是删除状态）
              newContent = "";
            }

            // 获取对比基准：如果有暂存就用暂存区，否则用 HEAD
            try {
              const isStaged = status.staged.includes(file);

              if (isStaged) {
                oldContent = await gitClient.show([`:${file}`]); // 文件已暂存，用暂存区作为对比基准
              } else {
                oldContent = await gitClient.show([`HEAD:${file}`]); // 文件未暂存，用 HEAD 作为对比基准
              }
            } catch {
              oldContent = ""; // 暂存区/HEAD 都不存在（全新文件）
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
      try {
        const result = await withTimeout(checkoutBranch(cwd, branch), GIT_TIMEOUT_MS);
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

async function getWorkingFiles(cwd: string) {
  const gitClient = git(cwd);
  const status = await gitClient.status();

  // 获取未暂存的已修改文件
  const modifiedFiles = status.modified
    .filter((file) => !status.staged.includes(file))
    .map((file) => ({
      ...str2file(cwd, file),
      status: "modified",
    }));

  // 获取未暂存的已删除文件
  const deletedFiles = status.deleted
    .filter((file) => !status.staged.includes(file))
    .map((file) => ({
      ...str2file(cwd, file),
      status: "deleted",
    }));

  // 获取未跟踪的文件（未暂存）
  const untrackedFiles = status.not_added
    .filter((file) => !status.staged.includes(file))
    .map((file) => ({
      ...str2file(cwd, file),
      status: "untracked",
    }));

  const allFiles = [...modifiedFiles, ...deletedFiles, ...untrackedFiles];
  return allFiles;
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
    const nameStatus = await gitClient.raw(["diff", "--name-status", mergeBase]);
    for (const line of nameStatus.trim().split("\n")) {
      if (!line) continue;
      const [statusChar, ...fileParts] = line.split("\t");
      const filePath = fileParts.join("\t");
      if (!filePath) continue;
      let status: "added" | "modified" | "deleted" = "modified";
      if (statusChar === "A") status = "added";
      else if (statusChar === "D") status = "deleted";
      files.push({
        relPath: filePath,
        fileName: path.basename(filePath),
        extName: path.extname(filePath).replace(".", ""),
        status,
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

async function getStagedFiles(cwd: string) {
  const gitClient = git(cwd);
  const status = await gitClient.status();

  // 获取已暂存的文件，区分新增、修改、删除状态
  const stagedAdded = status.created
    .filter((file) => status.staged.includes(file))
    .map((file) => ({
      ...str2file(cwd, file),
      status: "added",
      staged: true,
    }));

  const stagedModified = status.modified
    .filter((file) => status.staged.includes(file))
    .map((file) => ({
      ...str2file(cwd, file),
      status: "modified",
      staged: true,
    }));

  const stagedDeleted = status.deleted
    .filter((file) => status.staged.includes(file))
    .map((file) => ({
      ...str2file(cwd, file),
      status: "deleted",
      staged: true,
    }));

  const allStagedFiles = [...stagedAdded, ...stagedModified, ...stagedDeleted];

  return allStagedFiles;
}
