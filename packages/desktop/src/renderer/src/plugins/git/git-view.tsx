import { useGitStatus } from "./use-git-status";

export default function GitView() {
  const status = useGitStatus();

  return (
    <div className="flex h-full flex-col p-3 gap-2">
      <h2 className="text-xs font-semibold text-muted-foreground">Source Control</h2>
      {status === null ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : status.branch === null ? (
        <p className="text-xs text-muted-foreground">Not a git repository</p>
      ) : (
        <div className="flex flex-col gap-1 text-xs">
          <p><span className="text-muted-foreground">Branch:</span> {status.branch}</p>
          <p><span className="text-muted-foreground">Changed:</span> {status.changed} files</p>
          <p><span className="text-muted-foreground">Ahead:</span> {status.ahead} <span className="text-muted-foreground">Behind:</span> {status.behind}</p>
        </div>
      )}
    </div>
  );
}
