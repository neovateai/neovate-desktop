import fs from "node:fs";
import path from "node:path";
import git from "simple-git";

/** staged but not committed diff string */
export async function gitDiffCached(cwd: string): Promise<string> {
  const gitClient = git(cwd);
  const diff = await gitClient.diff(["--cached"]);
  return diff;
}

/** file diff detail  */
export async function getFileDiff(cwd: string, relPath: string, diffType: "staged" | "working") {
  const gitClient = git(cwd);

  let oldContent = "";
  let newContent = "";
  let fileStatus = "";

  try {
    const status = await gitClient.status();
    const gitRoot = (await gitClient.revparse(["--show-toplevel"])).trim();
    const absoluteFile = path.resolve(cwd, relPath);
    const gitRelFile = path.relative(gitRoot, absoluteFile);

    if (status.not_added.includes(gitRelFile)) {
      fileStatus = "untracked";
    } else if (status.created.includes(gitRelFile)) {
      fileStatus = "added";
    } else if (status.modified.includes(gitRelFile)) {
      fileStatus = "modified";
    } else if (status.deleted.includes(gitRelFile)) {
      fileStatus = "deleted";
    }

    if (diffType === "staged") {
      try {
        newContent = await gitClient.show([`:${gitRelFile}`]);
      } catch {
        newContent = "";
      }

      try {
        oldContent = await gitClient.show([`HEAD:${gitRelFile}`]);
      } catch {
        oldContent = "";
      }
    } else {
      try {
        newContent = fs.readFileSync(absoluteFile, "utf8");
      } catch {
        newContent = "";
      }

      try {
        const isStaged = status.staged.includes(gitRelFile);

        if (isStaged) {
          oldContent = await gitClient.show([`:${gitRelFile}`]);
        } else {
          oldContent = await gitClient.show([`HEAD:${gitRelFile}`]);
        }
      } catch {
        oldContent = "";
      }
    }
  } catch (error) {
    console.error("Error reading file contents:", error);
  }
  return {
    oldContent,
    newContent,
    fileStatus,
  };
}
