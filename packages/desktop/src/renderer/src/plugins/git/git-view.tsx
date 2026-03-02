import type { ContractRouterClient } from "@orpc/contract";
import { useState, useEffect } from "react";
import { usePluginContext } from "../../core/app";
import type { GitStatus } from "../../../../shared/plugins/git/contract";
import { gitContract } from "../../../../shared/plugins/git/contract";

type Client = ContractRouterClient<{ git: typeof gitContract }>;

export default function GitView() {
  const { orpcClient } = usePluginContext();
  const client = orpcClient as Client;
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    client.git.status().then(setStatus);
  }, []);

  return (
    <div className="flex h-full flex-col p-3 gap-2">
      <h2 className="text-xs font-semibold text-muted-foreground">Source Control</h2>
      {status === null ? (
        <p className="text-xs text-muted-foreground">Loading...</p>
      ) : status.branch === null ? (
        <p className="text-xs text-muted-foreground">Not a git repository</p>
      ) : (
        <div className="flex flex-col gap-1 text-xs">
          <p>
            <span className="text-muted-foreground">Branch:</span> {status.branch}
          </p>
          <p>
            <span className="text-muted-foreground">Changed:</span> {status.changed} files
          </p>
          <p>
            <span className="text-muted-foreground">Ahead:</span> {status.ahead}{" "}
            <span className="text-muted-foreground">Behind:</span> {status.behind}
          </p>
        </div>
      )}
    </div>
  );
}
