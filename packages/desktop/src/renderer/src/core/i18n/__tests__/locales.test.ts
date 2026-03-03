import { describe, expect, it } from "vitest";
import { normalizeLocale } from "../locales";

describe("normalizeLocale", () => {
  it("returns supported locale for English variants", () => {
    expect(normalizeLocale("en-US")).toBe("en-US");
    expect(normalizeLocale("en-GB")).toBe("en-US");
    expect(normalizeLocale("en_US")).toBe("en-US");
    expect(normalizeLocale("EN-us")).toBe("en-US");
  });

  it("returns supported locale for Chinese variants", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh-HK")).toBe("zh-CN");
    expect(normalizeLocale("zh")).toBe("zh-CN");
  });

  it("falls back to default locale for unknown tags", () => {
    expect(normalizeLocale("fr-FR")).toBe("en-US");
    expect(normalizeLocale("")).toBe("en-US");
  });
});
