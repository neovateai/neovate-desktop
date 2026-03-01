import { useCallback, useEffect, useRef } from "react";
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

function getPromptErrorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "";
  }

  if (error && typeof error === "object") {
    const obj = error as { data?: { message?: unknown }; message?: unknown };
    if (typeof obj.data?.message === "string" && obj.data.message.trim()) {
      return obj.data.message;
    }
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Agent request failed. Please try again.";
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
        const message = getPromptErrorMessage(error);
        if (message) {
          useAcpStore.getState().setPromptError(sessionId, message);
        }
        console.error("[acp-prompt] sendPrompt failed", {
          connectionId,
          sessionId,
          error,
        });
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
