import type { ContractRouterClient } from "@orpc/contract";
import { useState, useEffect } from "react";
import { usePluginContext } from "../../core/app";
import type { SystemInfo } from "./contract";
import { systemInfoContract } from "./contract";

type Client = ContractRouterClient<{ systemInfo: typeof systemInfoContract }>;

export function useSystemInfo(): SystemInfo | null {
  const { orpcClient } = usePluginContext();
  const client = orpcClient as Client;
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    client.systemInfo.getInfo().then(setInfo);
  }, []);

  return info;
}
