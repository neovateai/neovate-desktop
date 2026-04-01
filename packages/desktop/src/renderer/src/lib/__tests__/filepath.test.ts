import { describe, expect, it } from "vitest";

import { findFilePathsInText, isFilePath, parseFilePath } from "../filepath";

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

describe("findFilePathsInText", () => {
  it("finds absolute path in text", () => {
    expect(findFilePathsInText("Error: /src/main.ts:42")).toEqual([
      { path: "/src/main.ts", line: 42, start: 7, end: 22 },
    ]);
  });

  it("finds home-relative path", () => {
    expect(findFilePathsInText("file ~/docs/readme.md modified")).toEqual([
      { path: "~/docs/readme.md", start: 5, end: 21 },
    ]);
  });

  it("finds path with line and col", () => {
    expect(findFilePathsInText("at /src/app.tsx:10:5")).toEqual([
      { path: "/src/app.tsx", line: 10, col: 5, start: 3, end: 20 },
    ]);
  });

  it("finds multiple paths in one line", () => {
    const result = findFilePathsInText("/src/a.ts and /src/b.ts");
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe("/src/a.ts");
    expect(result[1].path).toBe("/src/b.ts");
  });

  it("skips paths inside URLs", () => {
    expect(findFilePathsInText("visit https://example.com/path.html")).toEqual([]);
  });

  it("skips paths preceded by word character", () => {
    expect(findFilePathsInText("word/path/file.ts")).toEqual([]);
  });

  it("finds path after delimiter", () => {
    expect(findFilePathsInText("(/src/file.ts)")).toEqual([
      { path: "/src/file.ts", start: 1, end: 13 },
    ]);
  });

  it("finds .env files", () => {
    expect(findFilePathsInText("loaded /app/.env.local")).toEqual([
      { path: "/app/.env.local", start: 7, end: 22 },
    ]);
  });

  it("finds path at start of line", () => {
    expect(findFilePathsInText("/src/index.ts:1")).toEqual([
      { path: "/src/index.ts", line: 1, start: 0, end: 15 },
    ]);
  });

  it("returns empty for no paths", () => {
    expect(findFilePathsInText("just some text")).toEqual([]);
  });
});
