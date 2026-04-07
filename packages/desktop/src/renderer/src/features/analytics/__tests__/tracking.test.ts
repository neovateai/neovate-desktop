// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../orpc", () => ({
  client: {
    analytics: {
      track: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

import { client } from "../../../orpc";
import { initClickTracking } from "../data-track";

const mockTrack = client.analytics.track as ReturnType<typeof vi.fn>;

describe("initClickTracking", () => {
  let cleanup: () => void;

  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup?.();
  });

  it("tracks click on data-track-id element", () => {
    cleanup = initClickTracking();
    const btn = document.createElement("button");
    btn.dataset.trackId = "ui.button.clicked";
    document.body.appendChild(btn);

    btn.click();

    expect(mockTrack).toHaveBeenCalledWith({
      event: "ui.button.clicked",
      properties: { trackType: "declarative-dom" },
    });
  });

  it("does nothing when clicking element without data-track-id", () => {
    cleanup = initClickTracking();
    const btn = document.createElement("button");
    document.body.appendChild(btn);

    btn.click();

    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("finds closest data-track-id ancestor for nested clicks", () => {
    cleanup = initClickTracking();
    const div = document.createElement("div");
    div.dataset.trackId = "ui.card.clicked";
    const span = document.createElement("span");
    div.appendChild(span);
    document.body.appendChild(div);

    span.click();

    expect(mockTrack).toHaveBeenCalledWith({
      event: "ui.card.clicked",
      properties: { trackType: "declarative-dom" },
    });
  });

  it("stops at nearest ancestor when nested tracked elements", () => {
    cleanup = initClickTracking();
    const outer = document.createElement("div");
    outer.dataset.trackId = "ui.outer.clicked";
    const inner = document.createElement("button");
    inner.dataset.trackId = "ui.inner.clicked";
    outer.appendChild(inner);
    document.body.appendChild(outer);

    inner.click();

    expect(mockTrack).toHaveBeenCalledOnce();
    expect(mockTrack).toHaveBeenCalledWith({
      event: "ui.inner.clicked",
      properties: { trackType: "declarative-dom" },
    });
  });

  it("cleanup removes the listener", () => {
    cleanup = initClickTracking();
    cleanup();
    const btn = document.createElement("button");
    btn.dataset.trackId = "ui.button.clicked";
    document.body.appendChild(btn);

    btn.click();

    expect(mockTrack).not.toHaveBeenCalled();
  });
});
