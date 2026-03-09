import { useCallback, useEffect, useRef } from "react";
import { ORPCError } from "@orpc/client";
import debug from "debug";
import { client } from "../../../orpc";
import { useAgentStore } from "../store";
import { useProjectStore } from "../../project/store";
import { useNewSession } from "./use-new-session";
import type { ImageAttachment } from "../../../../../shared/features/agent/types";

const promptLog = debug("neovate:agent-prompt");

export function usePrompt() {
  const abortRef = useRef<AbortController | null>(null);
  const addUserMessage = useAgentStore((s) => s.addUserMessage);
  const appendChunk = useAgentStore((s) => s.appendChunk);
  const setStreaming = useAgentStore((s) => s.setStreaming);
  const createSession = useAgentStore((s) => s.createSession);
  const setAvailableCommands = useAgentStore((s) => s.setAvailableCommands);
  const setAvailableModels = useAgentStore((s) => s.setAvailableModels);
  const setCurrentModel = useAgentStore((s) => s.setCurrentModel);
  const addTiming = useAgentStore((s) => s.addTiming);
  const { preWarmSession } = useNewSession();

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const sendPrompt = useCallback(
    async (sessionId: string | undefined, prompt: string, attachments?: ImageAttachment[]) => {
      const promptStart = performance.now();
      let resolvedSessionId = sessionId;
      const projectPath = useProjectStore.getState().activeProject?.path;
      const cwd = projectPath ?? "";

      if (!resolvedSessionId) {
        const sessionStart = performance.now();
        promptLog("sendPrompt: creating session cwd=%s", cwd);
        const {
          sessionId: newSessionId,
          commands,
          models,
          currentModel,
        } = await client.agent.newSession({ cwd });
        resolvedSessionId = newSessionId;
        const sessionElapsed = Math.round(performance.now() - sessionStart);
        promptLog(
          "sendPrompt: session created in %dms sessionId=%s currentModel=%s",
          sessionElapsed,
          resolvedSessionId,
          currentModel,
        );
        addTiming({
          phase: "prompt",
          label: "newSession",
          durationMs: sessionElapsed,
          timestamp: Date.now(),
        });

        createSession(resolvedSessionId, { cwd: projectPath });
        if (commands?.length) {
          setAvailableCommands(resolvedSessionId, commands);
        }
        if (models?.length) {
          setAvailableModels(resolvedSessionId, models);
        }
        if (currentModel) {
          setCurrentModel(resolvedSessionId, currentModel);
        }
      }

      promptLog(
        "sendPrompt: start sessionId=%s len=%d attachments=%d attachmentDetails=%o",
        resolvedSessionId,
        prompt.length,
        attachments?.length ?? 0,
        attachments?.map((a) => ({
          id: a.id,
          filename: a.filename,
          mediaType: a.mediaType,
          base64Len: a.base64?.length ?? 0,
        })),
      );
      useAgentStore.getState().setPromptError(resolvedSessionId, null);

      // Check if this was a new session before sending the first message
      const wasNew = useAgentStore.getState().sessions.get(resolvedSessionId)?.isNew;
      addUserMessage(
        resolvedSessionId,
        prompt,
        attachments?.map((a) => ({ mediaType: a.mediaType, base64: a.base64 })),
      );
      setStreaming(resolvedSessionId, true);

      // Pre-warm next empty session in background after first message
      if (wasNew && cwd) {
        preWarmSession(cwd).catch((err) =>
          promptLog(
            "sendPrompt: preWarm failed error=%s",
            err instanceof Error ? err.message : String(err),
          ),
        );
      }

      // Wait for SDK to be ready (may be resuming in background)
      const currentSession = useAgentStore.getState().sessions.get(resolvedSessionId);
      if (currentSession && !currentSession.sdkReady) {
        promptLog("sendPrompt: waiting for SDK ready sid=%s", resolvedSessionId);
        await new Promise<void>((resolve) => {
          const unsub = useAgentStore.subscribe((state) => {
            const s = state.sessions.get(resolvedSessionId!);
            if (s?.sdkReady) {
              unsub();
              resolve();
            }
          });
          // Check again in case it became ready between our check and subscribe
          if (useAgentStore.getState().sessions.get(resolvedSessionId!)?.sdkReady) {
            unsub();
            resolve();
          }
        });
        promptLog("sendPrompt: SDK now ready sid=%s", resolvedSessionId);
      }

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const rpcStart = performance.now();
        promptLog(
          "sendPrompt: calling oRPC prompt sessionId=%s attachments=%s",
          resolvedSessionId,
          attachments ? `${attachments.length} items` : "none",
        );
        const iterator = await client.agent.prompt(
          { sessionId: resolvedSessionId, prompt, attachments },
          { signal: ac.signal },
        );
        const rpcElapsed = Math.round(performance.now() - rpcStart);
        promptLog("sendPrompt: iterator ready in %dms", rpcElapsed);
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
            promptLog("sendPrompt: first event after %dms", ttfe, { eventType: event.type });
            addTiming({
              phase: "prompt",
              label: "time_to_first_event",
              durationMs: ttfe,
              timestamp: Date.now(),
            });
          }
          appendChunk(resolvedSessionId, event);
        }
        const totalElapsed = Math.round(performance.now() - promptStart);
        promptLog("sendPrompt: completed in %dms (events=%d)", totalElapsed, eventCount);
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

        promptLog(
          "sendPrompt: ERROR sessionId=%s message=%s error=%o",
          resolvedSessionId,
          message,
          error,
        );
        useAgentStore.getState().setPromptError(resolvedSessionId, message);
      } finally {
        setStreaming(resolvedSessionId, false);
        abortRef.current = null;
      }
    },
    [
      addUserMessage,
      appendChunk,
      setStreaming,
      createSession,
      setAvailableCommands,
      setAvailableModels,
      setCurrentModel,
      addTiming,
      preWarmSession,
    ],
  );

  const cancel = useCallback(async (sessionId: string) => {
    promptLog("cancel: sessionId=%s", sessionId);
    abortRef.current?.abort();
    await client.agent.cancel({ sessionId });
    promptLog("cancel: done sessionId=%s", sessionId);
  }, []);

  return { sendPrompt, cancel };
}
