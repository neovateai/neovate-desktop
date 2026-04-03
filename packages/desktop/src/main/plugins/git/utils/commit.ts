import git from "simple-git";

export async function gitCommit(cwd: string, message: string) {
  const gitClient = git(cwd);
  await gitClient.commit(message);
}
