// @vitest-environment jsdom
import type { AnalyticsInstance } from "analytics";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { initClickTracking } from "../data-track";

function createMockAnalytics(): AnalyticsInstance {
  return { track: vi.fn() } as unknown as AnalyticsInstance;
}

describe("initClickTracking", () => {
  let cleanup: () => void;
  let analytics: AnalyticsInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
    analytics = createMockAnalytics();
  });

  afterEach(() => {
    cleanup?.();
  });

  it("tracks click on data-track-id element", () => {
    cleanup = initClickTracking(analytics);
    const btn = document.createElement("button");
    btn.dataset.trackId = "test.button.clicked";
    document.body.appendChild(btn);

    btn.click();

    expect(analytics.track).toHaveBeenCalledWith("test.button.clicked", {
      trackType: "declarative-dom",
    });
  });

  it("does nothing when clicking element without data-track-id", () => {
    cleanup = initClickTracking(analytics);
    const btn = document.createElement("button");
    document.body.appendChild(btn);

    btn.click();

    expect(analytics.track).not.toHaveBeenCalled();
  });

  it("finds closest data-track-id ancestor for nested clicks", () => {
    cleanup = initClickTracking(analytics);
    const div = document.createElement("div");
    div.dataset.trackId = "test.card.clicked";
    const span = document.createElement("span");
    div.appendChild(span);
    document.body.appendChild(div);

    span.click();

    expect(analytics.track).toHaveBeenCalledWith("test.card.clicked", {
      trackType: "declarative-dom",
    });
  });

  it("stops at nearest ancestor when nested tracked elements", () => {
    cleanup = initClickTracking(analytics);
    const outer = document.createElement("div");
    outer.dataset.trackId = "test.outer.clicked";
    const inner = document.createElement("button");
    inner.dataset.trackId = "test.inner.clicked";
    outer.appendChild(inner);
    document.body.appendChild(outer);

    inner.click();

    expect(analytics.track).toHaveBeenCalledOnce();
    expect(analytics.track).toHaveBeenCalledWith("test.inner.clicked", {
      trackType: "declarative-dom",
    });
  });

  it("cleanup removes the listener", () => {
    cleanup = initClickTracking(analytics);
    cleanup();
    const btn = document.createElement("button");
    btn.dataset.trackId = "test.button.clicked";
    document.body.appendChild(btn);

    btn.click();

    expect(analytics.track).not.toHaveBeenCalled();
  });
});
