import { describe, expect, it } from "vitest";

import { isFilePath, parseFilePath } from "../filepath";

describe("isFilePath", () => {
  it.each([
    "/absolute/path/file.py",
    "/Users/dinq/project/src/App.tsx",
    "/file.rs",
    "~/projects/app/index.ts",
    "~/config.json",
    "/Users/me/My Project/src/App.tsx",
    "/path/to/#readme.md",
    "/project/.env.local",
    "~/.env.production",
    "/app/.env.development",
  ])("matches absolute/home path: %s", (input) => {
    expect(isFilePath(input)).toBe(true);
  });

  it.each(["/src/Button.tsx:42", "/path/file.ts:10:5", "~/utils.py:100"])(
    "matches path with line/col: %s",
    (input) => {
      expect(isFilePath(input)).toBe(true);
    },
  );

  it.each([
    "src/components/Button.tsx",
    "./utils.ts",
    "../lib/helpers.js",
    "file.rs",
    "package.json",
    ".env",
    "useState()",
    "npm install",
    "hello world",
    "MY_CONSTANT",
    "https://example.com/path.js",
    "http://localhost:3000/file.ts",
    "1.2.3",
    "v2.0.0",
    "text.replace(/^",
    "obj.method()",
    "process.env.NODE_ENV",
  ])("rejects non-absolute path: %s", (input) => {
    expect(isFilePath(input)).toBe(false);
  });
});

describe("parseFilePath", () => {
  it("parses absolute path", () => {
    expect(parseFilePath("/src/Button.tsx")).toEqual({
      path: "/src/Button.tsx",
    });
  });

  it("parses home-relative path", () => {
    expect(parseFilePath("~/src/Button.tsx")).toEqual({
      path: "~/src/Button.tsx",
    });
  });

  it("parses path with line", () => {
    expect(parseFilePath("/src/Button.tsx:42")).toEqual({
      path: "/src/Button.tsx",
      line: 42,
    });
  });

  it("parses path with line and col", () => {
    expect(parseFilePath("/src/Button.tsx:42:10")).toEqual({
      path: "/src/Button.tsx",
      line: 42,
      col: 10,
    });
  });

  it("returns null for relative path", () => {
    expect(parseFilePath("src/Button.tsx")).toBeNull();
  });

  it("returns null for non-file-path", () => {
    expect(parseFilePath("useState()")).toBeNull();
  });
});
