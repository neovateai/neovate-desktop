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

  it("tracks click on data-track element", () => {
    cleanup = initClickTracking();
    const btn = document.createElement("button");
    btn.setAttribute("data-track", "ui.button.clicked");
    document.body.appendChild(btn);

    btn.click();

    expect(mockTrack).toHaveBeenCalledWith({
      event: "ui.button.clicked",
      properties: {},
    });
  });

  it("extracts data-track-* properties", () => {
    cleanup = initClickTracking();
    const btn = document.createElement("button");
    btn.setAttribute("data-track", "ui.model.changed");
    btn.setAttribute("data-track-model", "gpt-4");
    btn.setAttribute("data-track-provider", "openai");
    document.body.appendChild(btn);

    btn.click();

    expect(mockTrack).toHaveBeenCalledWith({
      event: "ui.model.changed",
      properties: { model: "gpt-4", provider: "openai" },
    });
  });

  it("does nothing when clicking element without data-track", () => {
    cleanup = initClickTracking();
    const btn = document.createElement("button");
    document.body.appendChild(btn);

    btn.click();

    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("finds closest data-track ancestor for nested clicks", () => {
    cleanup = initClickTracking();
    const div = document.createElement("div");
    div.setAttribute("data-track", "ui.card.clicked");
    const span = document.createElement("span");
    div.appendChild(span);
    document.body.appendChild(div);

    span.click();

    expect(mockTrack).toHaveBeenCalledWith({
      event: "ui.card.clicked",
      properties: {},
    });
  });

  it("cleanup removes the listener", () => {
    cleanup = initClickTracking();
    cleanup();
    const btn = document.createElement("button");
    btn.setAttribute("data-track", "ui.button.clicked");
    document.body.appendChild(btn);

    btn.click();

    expect(mockTrack).not.toHaveBeenCalled();
  });
});
