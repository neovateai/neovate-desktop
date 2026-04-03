import { describe, expect, it } from "vitest";

import { isImeComposingKeyEvent } from "../keyboard";

describe("isImeComposingKeyEvent", () => {
  it("returns true while native composition is active", () => {
    expect(isImeComposingKeyEvent({ isComposing: true, keyCode: 13 })).toBe(true);
  });

  it("returns true for IME processing keyCode fallback", () => {
    expect(isImeComposingKeyEvent({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it("returns false for a normal enter key", () => {
    expect(isImeComposingKeyEvent({ isComposing: false, keyCode: 13 })).toBe(false);
  });
});
