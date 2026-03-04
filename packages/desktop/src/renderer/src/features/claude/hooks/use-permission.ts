import { useCallback } from "react";
import { client } from "../../../orpc";
import { useClaudeStore } from "../store";

export function usePermission() {
  const setPendingPermission = useClaudeStore((s) => s.setPendingPermission);

  const resolvePermission = useCallback(
    async (sessionId: string, requestId: string, allow: boolean) => {
      await client.claude.resolvePermission({ requestId, allow });
      setPendingPermission(sessionId, null);
    },
    [setPendingPermission],
  );

  return { resolvePermission };
}
