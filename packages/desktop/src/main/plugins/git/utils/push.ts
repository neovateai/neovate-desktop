import git from "simple-git";

export async function gitPush(cwd: string, opts: { setUpstream?: boolean }) {
  const { setUpstream = false } = opts || {};
  const gitClient = git(cwd);
  // 没有上游分支的情况下进行push，
  if (setUpstream) {
    const status = await gitClient.status();
    const currentBranch = status.current;
    if (!currentBranch) {
      throw new Error("No current branch found");
    }
    const remotes = await gitClient.getRemotes(true);
    const remoteName = remotes.find((r) => r.name === "origin")?.name || remotes[0]?.name;
    if (!remoteName) {
      throw new Error("No remote found");
    }
    await gitClient.push(["--set-upstream", remoteName, currentBranch]);
  } else {
    await gitClient.push();
  }
}
