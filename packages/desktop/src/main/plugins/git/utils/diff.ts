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
export async function getFileDiff(cwd: string, file: string, diffType: "staged" | "working") {
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
    oldContent,
    newContent,
    fileStatus,
  };
}
