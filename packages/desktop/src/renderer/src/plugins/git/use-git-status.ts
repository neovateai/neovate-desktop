import type { ContractRouterClient } from "@orpc/contract";
import { useState, useEffect } from "react";
import { usePluginContext } from "../../core/app";
import type { GitStatus } from "../../../../shared/plugins/git/contract";
import { gitContract } from "../../../../shared/plugins/git/contract";

type Client = ContractRouterClient<{ git: typeof gitContract }>;

export function useGitStatus(): GitStatus | null {
  const { orpcClient } = usePluginContext();
  const client = orpcClient as Client;
  const [status, setStatus] = useState<GitStatus | null>(null);

  useEffect(() => {
    client.git.status().then(setStatus);
  }, []);

  return status;
}
