import { describe, it, expect } from "vitest";

import { resolveLocalizedString } from "../i18n";

describe("resolveLocalizedString", () => {
  it("returns plain string as-is", () => {
    expect(resolveLocalizedString("Hello", "en-US")).toBe("Hello");
    expect(resolveLocalizedString("Hello", "zh-CN")).toBe("Hello");
  });

  it("resolves locale map to matching locale", () => {
    const value = { "en-US": "Editor", "zh-CN": "编辑器" };
    expect(resolveLocalizedString(value, "en-US")).toBe("Editor");
    expect(resolveLocalizedString(value, "zh-CN")).toBe("编辑器");
  });

  it("falls back to en-US for unknown locale", () => {
    const value = { "en-US": "Editor" };
    expect(resolveLocalizedString(value, "zh-CN")).toBe("Editor");
  });

  it("falls back to first value when en-US is missing", () => {
    const value = { "zh-CN": "编辑器" };
    expect(resolveLocalizedString(value, "ja-JP")).toBe("编辑器");
  });
});
