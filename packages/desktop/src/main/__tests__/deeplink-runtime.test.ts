import { describe, expect, it, vi } from "vitest";

import { createDeepLinkRuntime } from "../lib/deeplink-runtime";

describe("deeplink runtime", () => {
  it("buffers one deeplink before ready and drops later ones", async () => {
    const handle = vi.fn(async () => {});
    const runtime = createDeepLinkRuntime({ handle });

    await runtime.receive("neo://open?project=%2Ftmp%2Fone");
    await runtime.receive("neo://open?project=%2Ftmp%2Ftwo");

    expect(runtime.getState()).toEqual({
      kind: "buffered",
      url: "neo://open?project=%2Ftmp%2Fone",
    });
    expect(handle).not.toHaveBeenCalled();
  });

  it("processes the buffered deeplink once ready", async () => {
    const handle = vi.fn(async () => {});
    const runtime = createDeepLinkRuntime({ handle });

    await runtime.receive("neo://open?project=%2Ftmp%2Fone");
    await runtime.markReady();

    expect(handle).toHaveBeenCalledWith("neo://open?project=%2Ftmp%2Fone");
    expect(runtime.getState()).toEqual({ kind: "idle" });
  });

  it("drops incoming deeplinks while one is handling", async () => {
    let release: (() => void) | null = null;
    const handle = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const runtime = createDeepLinkRuntime({ handle });

    await runtime.markReady();
    const first = runtime.receive("neo://open?project=%2Ftmp%2Fone");
    await Promise.resolve();
    await runtime.receive("neo://open?project=%2Ftmp%2Ftwo");

    expect(handle).toHaveBeenCalledTimes(1);
    expect(runtime.getState()).toEqual({
      kind: "handling",
      url: "neo://open?project=%2Ftmp%2Fone",
    });

    release?.();
    await first;
    expect(runtime.getState()).toEqual({ kind: "idle" });
  });
});
