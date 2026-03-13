import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { claudeCodeChatManager } from "../chat-manager";
import { VERBS } from "../components/query-status";

const SPINNER_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽"];
const PING_PONG = [...SPINNER_FRAMES, ...SPINNER_FRAMES.slice(1, -1).reverse()];
const STALL_THRESHOLD_MS = 3_000;
const COMPLETION_FLASH_MS = 2_500;
const TICK_MS = 100;
const FRAMES_PER_TICK = 2; // advance spinner every 2 ticks (~200ms)

export type QueryStatusPhase = "idle" | "active" | "completing";

export interface QueryStatus {
  phase: QueryStatusPhase;
  verb: string;
  pastVerb: string;
  elapsedMs: number;
  thinkingDurationMs: number | null;
  isThinking: boolean;
  isStalled: boolean;
  spinnerFrame: string;
}

const IDLE: QueryStatus = {
  phase: "idle",
  verb: "",
  pastVerb: "",
  elapsedMs: 0,
  thinkingDurationMs: null,
  isThinking: false,
  isStalled: false,
  spinnerFrame: SPINNER_FRAMES[0],
};

function pickVerb(): [string, string] {
  return VERBS[Math.floor(Math.random() * VERBS.length)];
}

const noop = () => () => {};

export function useQueryStatus(sessionId: string | null): QueryStatus {
  const chat = sessionId ? claudeCodeChatManager.getChat(sessionId) : undefined;

  const subscribe = useCallback(
    (cb: () => void) => (chat ? chat.store.subscribe(cb) : noop()),
    [chat],
  );

  const chatStatus = useSyncExternalStore(
    subscribe,
    () => chat?.store.getState().status ?? "ready",
  );

  const isActive = chatStatus === "submitted" || chatStatus === "streaming";

  const verbRef = useRef<[string, string]>(pickVerb());
  const [tick, setTick] = useState(0);
  const [phase, setPhase] = useState<QueryStatusPhase>("idle");
  const flashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveRef = useRef(false);

  // Detect turn start/end transitions
  useEffect(() => {
    if (isActive && !prevActiveRef.current) {
      // Turn just started
      verbRef.current = pickVerb();
      setPhase("active");
      setTick(0);
      if (flashTimerRef.current) {
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = null;
      }
    } else if (!isActive && prevActiveRef.current) {
      // Turn just ended — start completion flash
      setPhase("completing");
      flashTimerRef.current = setTimeout(() => {
        setPhase("idle");
        // Clear store timing fields
        chat?.store.setState({
          turnStartedAt: null,
          thinkingStartedAt: null,
          thinkingDuration: null,
          lastChunkAt: null,
        });
      }, COMPLETION_FLASH_MS);
    }
    prevActiveRef.current = isActive;
  }, [isActive, chat]);

  // Tick interval for elapsed time + spinner animation
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => setTick((t) => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  // Cleanup flash timer on unmount
  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  if (phase === "idle") return IDLE;

  const state = chat?.store.getState();
  const turnStartedAt = state?.turnStartedAt ?? 0;
  const thinkingStartedAt = state?.thinkingStartedAt ?? null;
  const thinkingDuration = state?.thinkingDuration ?? null;
  const lastChunkAt = state?.lastChunkAt ?? null;
  const now = Date.now();

  const elapsedMs = turnStartedAt ? now - turnStartedAt : 0;
  const isThinking = thinkingStartedAt !== null;
  const isStalled =
    !isThinking &&
    phase === "active" &&
    lastChunkAt !== null &&
    now - lastChunkAt > STALL_THRESHOLD_MS;

  // Accumulate current thinking block duration if still thinking
  let thinkingDurationMs = thinkingDuration;
  if (isThinking && thinkingStartedAt) {
    thinkingDurationMs = (thinkingDuration ?? 0) + (now - thinkingStartedAt);
  }

  const frameIndex = Math.floor(tick / FRAMES_PER_TICK) % PING_PONG.length;

  return {
    phase,
    verb: verbRef.current[0],
    pastVerb: verbRef.current[1],
    elapsedMs,
    thinkingDurationMs,
    isThinking,
    isStalled,
    spinnerFrame: PING_PONG[frameIndex],
  };
}
