import git from "simple-git";

export async function gitAdd(cwd: string, files: string[]) {
  const gitClient = git(cwd);
  await gitClient.add(files);
}
