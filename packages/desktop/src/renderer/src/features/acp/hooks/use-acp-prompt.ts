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
  const setAvailableCommands = useAcpStore((s) => s.setAvailableCommands);
  const addTiming = useAcpStore((s) => s.addTiming);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendPrompt = useCallback(
    async (connectionId: string, sessionId: string | undefined, prompt: string) => {
      const promptStart = performance.now();
      let resolvedSessionId = sessionId;

      if (!resolvedSessionId) {
        const sessionStart = performance.now();
        acpPromptLog("sendPrompt: creating session", { connectionId });
        const { sessionId: newSessionId, commands } = await client.acp.newSession({
          connectionId,
        });
        resolvedSessionId = newSessionId;
        const sessionElapsed = Math.round(performance.now() - sessionStart);
        acpPromptLog("sendPrompt: session created in %dms", sessionElapsed, {
          connectionId,
          sessionId: resolvedSessionId,
          commands,
        });
        addTiming({
          phase: "prompt",
          label: "newSession",
          durationMs: sessionElapsed,
          timestamp: Date.now(),
        });

        const projectPath = useProjectStore.getState().activeProject?.path;
        createSession(
          resolvedSessionId,
          connectionId,
          projectPath ? { cwd: projectPath } : undefined,
        );
        if (commands?.length) {
          setAvailableCommands(resolvedSessionId, commands);
        }
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
        const rpcStart = performance.now();
        const iterator = await client.acp.prompt(
          { connectionId, sessionId: resolvedSessionId, prompt },
          { signal: ac.signal },
        );
        const rpcElapsed = Math.round(performance.now() - rpcStart);
        acpPromptLog("sendPrompt: iterator ready in %dms", rpcElapsed, {
          connectionId,
          sessionId: resolvedSessionId,
        });
        addTiming({
          phase: "prompt",
          label: "rpc_setup",
          durationMs: rpcElapsed,
          timestamp: Date.now(),
        });

        let eventCount = 0;
        let firstEventAt: number | undefined;

        for await (const event of iterator) {
          eventCount += 1;
          if (!firstEventAt) {
            firstEventAt = performance.now();
            const ttfe = Math.round(firstEventAt - promptStart);
            acpPromptLog("sendPrompt: first event after %dms", ttfe, { eventType: event.type });
            addTiming({
              phase: "prompt",
              label: "time_to_first_event",
              durationMs: ttfe,
              timestamp: Date.now(),
            });
          }
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
        const totalElapsed = Math.round(performance.now() - promptStart);
        acpPromptLog("sendPrompt: completed in %dms (events=%d)", totalElapsed, eventCount, {
          connectionId,
          sessionId: resolvedSessionId,
        });
        addTiming({
          phase: "prompt",
          label: "total",
          durationMs: totalElapsed,
          timestamp: Date.now(),
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
    [addUserMessage, appendChunk, setStreaming, createSession, setAvailableCommands, addTiming],
  );

  const cancel = useCallback(async (connectionId: string, sessionId: string) => {
    abortRef.current?.abort();
    await client.acp.cancel({ connectionId, sessionId });
  }, []);

  return { sendPrompt, cancel };
}
