import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { DEFAULT_SETTINGS } from "../../../../../shared/features/settings/schema";
import { SettingsService, type SettingsServiceOptions } from "../service";

describe("SettingsService", () => {
  let load: ReturnType<typeof vi.fn<SettingsServiceOptions["load"]>>;
  let save: ReturnType<typeof vi.fn<SettingsServiceOptions["save"]>>;
  let service: SettingsService;

  beforeEach(() => {
    vi.useFakeTimers();
    load = vi
      .fn<SettingsServiceOptions["load"]>()
      .mockResolvedValue({ preferences: { theme: "system", fontSize: 14 } });
    save = vi.fn<SettingsServiceOptions["save"]>();
    service = new SettingsService({ load, save });
  });

  afterEach(() => {
    service.dispose();
    vi.useRealTimers();
  });

  describe("hydrate", () => {
    it("populates store from load()", async () => {
      await service.hydrate();
      expect(service.store.getState()).toEqual({
        preferences: { theme: "system", fontSize: 14 },
      });
    });

    it("does not trigger save on hydrate", async () => {
      await service.hydrate();
      vi.advanceTimersByTime(1000);
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("debounced save", () => {
    it("batches rapid writes into one save", async () => {
      await service.hydrate();

      const prefs = service.scoped("preferences");
      prefs.set("fontSize", 12);
      prefs.set("fontSize", 14);
      prefs.set("fontSize", 16);

      vi.advanceTimersByTime(500);
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ preferences: expect.objectContaining({ fontSize: 16 }) }),
      );
    });

    it("does not save before flush delay", async () => {
      await service.hydrate();

      const prefs = service.scoped("preferences");
      prefs.set("fontSize", 20);

      vi.advanceTimersByTime(499);
      expect(save).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1);
      expect(save).toHaveBeenCalledTimes(1);
    });
  });

  describe("dispose", () => {
    it("flushes pending writes on dispose", async () => {
      await service.hydrate();

      const prefs = service.scoped("preferences");
      prefs.set("fontSize", 20);

      // dispose before timer fires
      service.dispose();
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ preferences: expect.objectContaining({ fontSize: 20 }) }),
      );
    });

    it("does not save on dispose if nothing changed", async () => {
      await service.hydrate();
      service.dispose();
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe("scoped", () => {
    it("returns the same instance for the same namespace", () => {
      const a = service.scoped("preferences");
      const b = service.scoped("preferences");
      expect(a).toBe(b);
    });

    it("reads and writes scoped data", async () => {
      await service.hydrate();
      const prefs = service.scoped("preferences");

      expect(prefs.get("fontSize")).toBe(14);
      prefs.set("fontSize", 20);
      expect(prefs.get("fontSize")).toBe(20);
    });

    it("subscribe does not fire when value is unchanged (shallow equality)", async () => {
      await service.hydrate();
      const prefs = service.scoped("preferences");
      const listener = vi.fn();
      prefs.subscribe(listener);

      prefs.set("fontSize", 14); // same value as hydrated
      expect(listener).not.toHaveBeenCalled();

      prefs.set("fontSize", 20);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("getAll returns copy of scoped data", async () => {
      await service.hydrate();
      const prefs = service.scoped("preferences");
      const all = prefs.getAll();

      expect(all).toEqual({ theme: "system", fontSize: 14 });
      // mutating the copy does not affect store
      (all as Record<string, unknown>).fontSize = 999;
      expect(prefs.get("fontSize")).toBe(14);
    });
  });

  describe("hydrate validation", () => {
    it("falls back to defaults when loaded data is invalid", async () => {
      load.mockResolvedValue({ preferences: { bad: "data" } } as any);
      await service.hydrate();
      expect(service.store.getState()).toEqual(DEFAULT_SETTINGS);
    });

    it("falls back to defaults when loaded data is empty", async () => {
      load.mockResolvedValue({});
      await service.hydrate();
      expect(service.store.getState()).toEqual(DEFAULT_SETTINGS);
    });
  });

  describe("save error handling", () => {
    it("logs error to console when save rejects", async () => {
      const error = new Error("RPC failed");
      save.mockRejectedValue(error);
      const spy = vi.spyOn(console, "error").mockImplementation(() => {});

      await service.hydrate();
      service.scoped("preferences").set("fontSize", 20);
      vi.advanceTimersByTime(500);

      // flush is sync but the promise rejection is async
      await vi.advanceTimersByTimeAsync(0);
      expect(spy).toHaveBeenCalledWith(error);
      spy.mockRestore();
    });
  });
});
