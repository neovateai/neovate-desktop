import { useCallback, useEffect, useRef } from "react";
import { ORPCError } from "@orpc/client";
import debug from "debug";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";
import { useProjectStore } from "../../project/store";

const acpPromptLog = debug("neovate:acp-prompt");

export function useAcpPrompt() {
  const abortRef = useRef<AbortController | null>(null);
  const addUserMessage = useAcpStore((s) => s.addUserMessage);
  const appendChunk = useAcpStore((s) => s.appendChunk);
  const setStreaming = useAcpStore((s) => s.setStreaming);
  const createSession = useAcpStore((s) => s.createSession);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendPrompt = useCallback(
    async (connectionId: string, sessionId: string | undefined, prompt: string) => {
      let resolvedSessionId = sessionId;

      // Lazy session creation: if no session yet, create one first
      if (!resolvedSessionId) {
        acpPromptLog("sendPrompt: creating session", { connectionId });
        const { sessionId: newSessionId } = await client.acp.newSession({
          connectionId,
        });
        resolvedSessionId = newSessionId;
        const projectPath = useProjectStore.getState().activeProject?.path;
        createSession(
          resolvedSessionId,
          connectionId,
          projectPath ? { cwd: projectPath } : undefined,
        );
        acpPromptLog("sendPrompt: session created", { connectionId, sessionId: resolvedSessionId });
      }

      acpPromptLog("sendPrompt: start", {
        connectionId,
        sessionId: resolvedSessionId,
        promptLength: prompt.length,
      });
      useAcpStore.getState().setPromptError(resolvedSessionId, null);
      addUserMessage(resolvedSessionId, prompt);
      setStreaming(resolvedSessionId, true);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const iterator = await client.acp.prompt(
          { connectionId, sessionId: resolvedSessionId, prompt },
          { signal: ac.signal },
        );
        acpPromptLog("sendPrompt: iterator ready", { connectionId, sessionId: resolvedSessionId });

        let eventCount = 0;

        for await (const event of iterator) {
          eventCount += 1;
          if (eventCount <= 10) {
            acpPromptLog("sendPrompt: event", {
              connectionId,
              sessionId: resolvedSessionId,
              eventType: event.type,
              eventCount,
            });
          }
          appendChunk(resolvedSessionId, event);
        }
        acpPromptLog("sendPrompt: completed", {
          connectionId,
          sessionId: resolvedSessionId,
          eventCount,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        let message: string;
        if (error instanceof ORPCError) {
          const data = error.data as { message?: string } | undefined;
          message = data?.message ?? error.message;
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = "Agent request failed. Please try again.";
        }

        useAcpStore.getState().setPromptError(resolvedSessionId, message);
        console.error("[acp-prompt] sendPrompt failed", {
          connectionId,
          sessionId: resolvedSessionId,
          error,
        });
      } finally {
        setStreaming(resolvedSessionId, false);
        abortRef.current = null;
        acpPromptLog("sendPrompt: cleanup", { connectionId, sessionId: resolvedSessionId });
      }
    },
    [addUserMessage, appendChunk, setStreaming, createSession],
  );

  const cancel = useCallback(async (connectionId: string, sessionId: string) => {
    abortRef.current?.abort();
    await client.acp.cancel({ connectionId, sessionId });
  }, []);

  return { sendPrompt, cancel };
}
