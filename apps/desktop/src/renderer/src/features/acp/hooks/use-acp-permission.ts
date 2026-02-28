import { useCallback } from "react";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";

export function useAcpPermission() {
  const setPendingPermission = useAcpStore((s) => s.setPendingPermission);

  const resolvePermission = useCallback(
    async (connectionId: string, sessionId: string, requestId: string, optionId: string) => {
      await client.acp.resolvePermission({
        connectionId,
        requestId,
        optionId,
      });
      setPendingPermission(sessionId, null);
    },
    [setPendingPermission],
  );

  return { resolvePermission };
}
