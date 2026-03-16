// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { beforeAll, describe, expect, it } from "vitest";

import { useTranslationWithMarker } from "../use-translation-with-marker";

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    resources: {
      "en-US": {
        "plugin-test": { "view.hello": "Hello" },
      },
    },
    lng: "en-US",
    keySeparator: false,
  });
});

describe("useTranslationWithMarker", () => {
  it("resolves %namespace:key% marker to translated string", () => {
    const { result } = renderHook(() => useTranslationWithMarker());
    expect(result.current("%plugin-test:view.hello%")).toBe("Hello");
  });

  it("returns non-marker strings as-is", () => {
    const { result } = renderHook(() => useTranslationWithMarker());
    expect(result.current("plain string")).toBe("plain string");
  });

  it("returns empty string as-is", () => {
    const { result } = renderHook(() => useTranslationWithMarker());
    expect(result.current("")).toBe("");
  });
});
