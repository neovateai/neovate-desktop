import { useCallback } from "react";
import { client } from "../../../orpc";
import { useAgentStore } from "../store";

export function usePermission() {
  const setPendingPermission = useAgentStore((s) => s.setPendingPermission);

  const resolvePermission = useCallback(
    async (sessionId: string, requestId: string, allow: boolean) => {
      await client.agent.resolvePermission({ requestId, allow });
      setPendingPermission(sessionId, null);
    },
    [setPendingPermission],
  );

  return { resolvePermission };
}
