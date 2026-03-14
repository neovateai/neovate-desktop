import { describe, expect, it } from "vitest";

import { buildInsertChatContent } from "../insert-chat";

describe("buildInsertChatContent", () => {
  it("builds content for multiple mentions followed by text", () => {
    expect(
      buildInsertChatContent({
        text: "Review",
        mentions: [{ id: "src/a.ts" }, { id: "src/b.ts", label: "src/b.ts" }],
      }),
    ).toEqual([
      { type: "mention", attrs: { id: "src/a.ts", label: "src/a.ts" } },
      { type: "text", text: " " },
      { type: "mention", attrs: { id: "src/b.ts", label: "src/b.ts" } },
      { type: "text", text: " " },
      { type: "text", text: "Review" },
    ]);
  });

  it("does not add a duplicate separator when text already starts with whitespace", () => {
    expect(
      buildInsertChatContent({
        text: " Review",
        mentions: [{ id: "src/a.ts" }],
      }),
    ).toEqual([
      { type: "mention", attrs: { id: "src/a.ts", label: "src/a.ts" } },
      { type: "text", text: " Review" },
    ]);
  });
});
