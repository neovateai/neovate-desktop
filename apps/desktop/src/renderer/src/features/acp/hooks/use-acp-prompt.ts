import { useCallback, useRef } from "react";
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

  if (typeof error === "string" && error.trim()) {
    return error;
  }

  if (error && typeof error === "object") {
    const objectError = error as {
      message?: unknown;
      code?: unknown;
      data?: unknown;
      status?: unknown;
    };

    if (objectError.data && typeof objectError.data === "object") {
      const data = objectError.data as { message?: unknown; detail?: unknown };
      if (typeof data.message === "string" && data.message.trim()) {
        return data.message;
      }
      if (typeof data.detail === "string" && data.detail.trim()) {
        return data.detail;
      }
    }

    if (typeof objectError.message === "string" && objectError.message.trim()) {
      if (objectError.message === "Internal server error") {
        return "Agent request failed on backend. Check ACP debug logs for details.";
      }
      return objectError.message;
    }
    if (typeof objectError.code === "string" && objectError.code.trim()) {
      return `Agent request failed (${objectError.code}).`;
    }
    if (typeof objectError.status === "number") {
      return `Agent request failed (HTTP ${objectError.status}).`;
    }
  }

  if (error instanceof Error && error.message.trim()) {
    if (error.message === "Internal server error") {
      return "Agent request failed on backend. Check ACP debug logs for details.";
    }
    return error.message;
  }

  return "Agent request failed. Please try again.";
}

export function useAcpPrompt() {
  const abortRef = useRef<AbortController | null>(null);
  const addUserMessage = useAcpStore((s) => s.addUserMessage);
  const appendChunk = useAcpStore((s) => s.appendChunk);
  const setStreaming = useAcpStore((s) => s.setStreaming);

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
            const sessionUpdate = event.type === "update" ? event.data.update.sessionUpdate : null;
            acpPromptLog("sendPrompt: event", {
              connectionId,
              sessionId,
              eventType: event.type,
              sessionUpdate,
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
