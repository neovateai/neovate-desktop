import { useCallback } from "react";
import debug from "debug";
import { client } from "../../../orpc";
import { useClaudeStore } from "../store";
import { useProjectStore } from "../../project/store";

const newSessionLog = debug("neovate:claude-new-session");

export function useNewSession() {
  const createSession = useClaudeStore((s) => s.createSession);
  const setAvailableCommands = useClaudeStore((s) => s.setAvailableCommands);

  const createNewSession = useCallback(
    async (cwd: string) => {
      // Dedup guard: if active session is already new (empty), reuse it
      const { activeSessionId, sessions } = useClaudeStore.getState();
      if (activeSessionId) {
        const active = sessions.get(activeSessionId);
        if (active?.isNew) {
          newSessionLog("createNewSession: reusing empty session %s", activeSessionId);
          return activeSessionId;
        }
      }

      newSessionLog("createNewSession: creating session cwd=%s", cwd);
      const { sessionId, commands } = await client.claude.newSession({ cwd });
      newSessionLog("createNewSession: created %s", sessionId);

      const projectPath = useProjectStore.getState().activeProject?.path;
      createSession(sessionId, {
        cwd: projectPath,
        isNew: true,
      });

      if (commands?.length) {
        setAvailableCommands(sessionId, commands);
      }

      return sessionId;
    },
    [createSession, setAvailableCommands],
  );

  return { createNewSession };
}
