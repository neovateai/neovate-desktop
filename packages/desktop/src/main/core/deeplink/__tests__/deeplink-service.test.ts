import { beforeEach, describe, expect, it, vi } from "vitest";

import { DeeplinkService } from "../deeplink-service";

describe("DeeplinkService", () => {
  let service: DeeplinkService;

  beforeEach(() => {
    service = new DeeplinkService();
  });

  // ─── Parsing ────────────────────────────────────────────────────────

  describe("parsing", () => {
    it("parses a valid deeplink URL", async () => {
      const handler = { handle: vi.fn().mockReturnValue("ok") };
      service.register("open", handler);
      await service.activate();

      service.handle("neovate://open/path?key=value");

      // Wait for async dispatch
      await vi.waitFor(() => expect(handler.handle).toHaveBeenCalled());
      expect(handler.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          path: "/path",
        }),
      );
      const ctx = handler.handle.mock.calls[0][0];
      expect(ctx.searchParams.get("key")).toBe("value");
    });

    it("ignores malformed URLs", async () => {
      await service.activate();
      // Should not throw
      service.handle("not-a-url");
    });
  });

  // ─── Registration ──────────────────────────────────────────────────

  describe("registration", () => {
    it("first-registered wins on name collision", async () => {
      const first = { handle: vi.fn().mockReturnValue("first") };
      const second = { handle: vi.fn().mockReturnValue("second") };

      service.register("test", first);
      service.register("test", second);
      await service.activate();

      service.handle("neovate://test/path");
      await vi.waitFor(() => expect(first.handle).toHaveBeenCalled());
      expect(second.handle).not.toHaveBeenCalled();
    });
  });

  // ─── Buffering ─────────────────────────────────────────────────────

  describe("buffering", () => {
    it("buffers URLs when not ready", async () => {
      const handler = { handle: vi.fn().mockReturnValue(null) };
      service.register("session", handler);

      // Handle before activate — should buffer
      service.handle("neovate://session/abc123?project=/tmp");
      expect(handler.handle).not.toHaveBeenCalled();

      // Activate flushes the buffer
      await service.activate();
      expect(handler.handle).toHaveBeenCalledTimes(1);
    });

    it("flushes buffer sequentially on activate", async () => {
      const order: number[] = [];
      const handler = {
        handle: vi.fn().mockImplementation(async () => {
          order.push(order.length + 1);
          await new Promise((r) => setTimeout(r, 10));
        }),
      };
      service.register("test", handler);

      service.handle("neovate://test/a");
      service.handle("neovate://test/b");

      await service.activate();
      expect(handler.handle).toHaveBeenCalledTimes(2);
      expect(order).toEqual([1, 2]);
    });
  });

  // ─── Dispatch ──────────────────────────────────────────────────────

  describe("dispatch", () => {
    it("includes handler return data in event", async () => {
      service.register("session", {
        handle: () => ({ sessionId: "abc", project: "/tmp" }),
      });
      await service.activate();

      service.handle("neovate://session/abc?project=/tmp");

      await vi.waitFor(() => expect(service.consumePending()).toHaveLength(1));
    });

    it("marks event unhandled when no handler exists", async () => {
      await service.activate();

      service.handle("neovate://unknown/path");

      await vi.waitFor(() => {
        const pending = service.consumePending();
        expect(pending).toHaveLength(1);
        expect(pending[0].unhandled).toBe(true);
      });
    });

    it("marks event handled when handler exists", async () => {
      service.register("test", { handle: () => "data" });
      await service.activate();

      service.handle("neovate://test/path");

      await vi.waitFor(() => {
        const pending = service.consumePending();
        expect(pending).toHaveLength(1);
        expect(pending[0].unhandled).toBe(false);
        expect(pending[0].data).toBe("data");
      });
    });
  });

  // ─── Error handling ────────────────────────────────────────────────

  describe("error handling", () => {
    it("does not publish event when handler throws", async () => {
      service.register("broken", {
        handle: () => {
          throw new Error("handler error");
        },
      });
      await service.activate();

      service.handle("neovate://broken/path");

      // Give async dispatch time to settle
      await new Promise((r) => setTimeout(r, 50));
      expect(service.consumePending()).toHaveLength(0);
    });
  });

  // ─── consumePending ────────────────────────────────────────────────

  describe("consumePending", () => {
    it("returns pending events and clears queue", async () => {
      await service.activate();
      service.handle("neovate://unhandled/a");
      service.handle("neovate://unhandled/b");

      await vi.waitFor(() => expect(service.consumePending()).toHaveLength(2));

      // Second call returns empty
      expect(service.consumePending()).toHaveLength(0);
    });
  });

  // ─── Publisher integration ─────────────────────────────────────────

  describe("publisher integration", () => {
    it("publishes to subscriber instead of pending when subscriber exists", async () => {
      service.register("test", { handle: () => "data" });
      await service.activate();

      const events: unknown[] = [];
      const controller = new AbortController();
      const iterator = service.publisher.subscribe("deeplink", { signal: controller.signal });

      // Start consuming in background
      const consuming = (async () => {
        for await (const event of iterator) {
          events.push(event);
          break; // take one event
        }
      })();

      service.handle("neovate://test/path");
      await consuming;
      controller.abort();

      expect(events).toHaveLength(1);
      expect(service.consumePending()).toHaveLength(0);
    });
  });

  // ─── Dispose ───────────────────────────────────────────────────────

  describe("dispose", () => {
    it("clears all state", () => {
      service.register("test", { handle: () => null });
      service.handle("neovate://test/a");
      service.dispose();

      expect(service.consumePending()).toHaveLength(0);
    });
  });
});
