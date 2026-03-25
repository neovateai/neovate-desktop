import { describe, expect, it } from "vitest";

import { findDeepLink, parseDeepLink, resolveDeepLinkIntent } from "../lib/deeplink";

describe("deeplink helpers", () => {
  it("finds neo deeplink from argv", () => {
    expect(findDeepLink(["electron", "--flag", "neo://open?project=%2Ftmp%2Fdemo"])).toBe(
      "neo://open?project=%2Ftmp%2Fdemo",
    );
  });

  it("parses deeplink into action and params", () => {
    expect(parseDeepLink("neo://open?project=%2Ftmp%2Fdemo&openDebug=1")).toEqual({
      action: "open",
      params: {
        project: "/tmp/demo",
        openDebug: "1",
      },
    });
  });

  it("resolves open deeplink intent and keeps extras", () => {
    expect(
      resolveDeepLinkIntent({
        action: "open",
        params: {
          project: "/tmp/demo",
          openDebug: "1",
        },
      }),
    ).toEqual({
      action: "open",
      projectPath: "/tmp/demo",
      extras: { openDebug: "1" },
    });
  });

  it("requires project for open intents", () => {
    expect(resolveDeepLinkIntent({ action: "open", params: {} })).toBeNull();
    expect(resolveDeepLinkIntent({ action: "open", params: { project: "demo" } })).toBeNull();
  });

  it("parses unsupported actions but does not resolve them into intents", () => {
    expect(parseDeepLink("neo://debug?project=%2Ftmp%2Fdemo")).toEqual({
      action: "debug",
      params: { project: "/tmp/demo" },
    });
    expect(
      resolveDeepLinkIntent({
        action: "debug",
        params: { project: "/tmp/demo" },
      }),
    ).toBeNull();
  });
});
