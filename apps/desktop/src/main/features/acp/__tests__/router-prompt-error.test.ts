import { call } from "@orpc/server";
import { describe, expect, it, vi } from "vitest";
import type { SessionEvent } from "../../../../shared/features/acp/types";
import { acpRouter } from "../router";
import type { AppContext } from "../../../router";

function makeAbortableHangingSubscription(signal: AbortSignal): AsyncGenerator<SessionEvent> {
  return (async function* () {
    await new Promise<void>((_, reject) => {
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), {
        once: true,
      });
    });
  })();
}

describe("acp router prompt error handling", () => {
  it("does not hang when sdk.prompt rejects", async () => {
    const promptError = new Error("prompt failed");

    const conn = {
      sdk: {
        prompt: vi.fn().mockRejectedValue(promptError),
      },
      subscribeSession: vi.fn((signal: AbortSignal) => makeAbortableHangingSubscription(signal)),
    };

    const context = {
      acpConnectionManager: {
        get: vi.fn().mockReturnValue(conn),
        getStderr: vi.fn().mockReturnValue(["stderr line"]),
      },
      acpAgentRegistry: {
        getAll: vi.fn().mockReturnValue([]),
        get: vi.fn(),
      },
    } as unknown as AppContext;

    const iterator = await call(
      acpRouter.prompt,
      { connectionId: "acp-1", sessionId: "s-1", prompt: "hi" },
      { context },
    );

    await expect(
      Promise.race([
        iterator.next(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("prompt handler timed out")), 300),
        ),
      ]),
    ).rejects.toMatchObject({
      defined: true,
      code: "BAD_GATEWAY",
      message: "prompt failed",
      data: {
        source: "acp_agent",
        message: "prompt failed",
        stderrTail: ["stderr line"],
      },
    });
  });

  it("ignores non-DOM abort errors from subscription when prompt completes", async () => {
    const conn = {
      sdk: {
        prompt: vi.fn().mockResolvedValue({ stopReason: "end_turn" }),
      },
      subscribeSession: vi.fn((signal: AbortSignal) =>
        (async function* () {
          await new Promise<void>((_, reject) => {
            signal.addEventListener("abort", () => reject({ type: "aborted" }), {
              once: true,
            });
          });
        })(),
      ),
    };

    const context = {
      acpConnectionManager: {
        get: vi.fn().mockReturnValue(conn),
        getStderr: vi.fn().mockReturnValue([]),
      },
      acpAgentRegistry: {
        getAll: vi.fn().mockReturnValue([]),
        get: vi.fn(),
      },
    } as unknown as AppContext;

    const iterator = await call(
      acpRouter.prompt,
      { connectionId: "acp-1", sessionId: "s-1", prompt: "hi" },
      { context },
    );

    await expect(
      (async () => {
        for await (const _event of iterator) {
          // no-op
        }
      })(),
    ).resolves.toBeUndefined();
  });
});
