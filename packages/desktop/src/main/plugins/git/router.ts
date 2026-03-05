import path from "node:path";
import type { PluginContext } from "../../core/plugin/types";
import git from "simple-git";

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
