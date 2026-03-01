import { useCallback, useEffect, useRef } from "react";
import { ORPCError } from "@orpc/client";
import { client } from "../../../orpc";
import { useAcpStore } from "../store";

const ACP_DEBUG = import.meta.env.DEV;

function acpPromptLog(message: string, details?: Record<string, unknown>) {
  if (!ACP_DEBUG) return;
  if (details) {
    console.log(`[acp-prompt] ${message}`, details);
    return;
  }
  console.log(`[acp-prompt] ${message}`);
}

export function useAcpPrompt() {
  const abortRef = useRef<AbortController | null>(null);
  const addUserMessage = useAcpStore((s) => s.addUserMessage);
  const appendChunk = useAcpStore((s) => s.appendChunk);
  const setStreaming = useAcpStore((s) => s.setStreaming);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendPrompt = useCallback(
    async (connectionId: string, sessionId: string, prompt: string) => {
      acpPromptLog("sendPrompt: start", {
        connectionId,
        sessionId,
        promptLength: prompt.length,
      });
      useAcpStore.getState().setPromptError(sessionId, null);
      addUserMessage(sessionId, prompt);
      setStreaming(sessionId, true);

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const iterator = await client.acp.prompt(
          { connectionId, sessionId, prompt },
          { signal: ac.signal },
        );
        acpPromptLog("sendPrompt: iterator ready", { connectionId, sessionId });

        let eventCount = 0;

        for await (const event of iterator) {
          eventCount += 1;
          if (eventCount <= 10) {
            acpPromptLog("sendPrompt: event", {
              connectionId,
              sessionId,
              eventType: event.type,
              eventCount,
            });
          }
          appendChunk(sessionId, event);
        }
        acpPromptLog("sendPrompt: completed", { connectionId, sessionId, eventCount });
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

        useAcpStore.getState().setPromptError(sessionId, message);
        console.error("[acp-prompt] sendPrompt failed", { connectionId, sessionId, error });
      } finally {
        setStreaming(sessionId, false);
        abortRef.current = null;
        acpPromptLog("sendPrompt: cleanup", { connectionId, sessionId });
      }
    },
    [addUserMessage, appendChunk, setStreaming],
  );

  const cancel = useCallback(async (connectionId: string, sessionId: string) => {
    abortRef.current?.abort();
    await client.acp.cancel({ connectionId, sessionId });
  }, []);

  return { sendPrompt, cancel };
}
