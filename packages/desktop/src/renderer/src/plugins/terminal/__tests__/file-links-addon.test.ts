import { describe, expect, it } from "vitest";

import { detectFilePath } from "../file-links-addon";

describe("detectFilePath", () => {
  describe("should detect relative paths", () => {
    it("detects ./file.ts", () => {
      const result = detectFilePath("./file.ts");
      expect(result).toEqual({ path: "./file.ts", line: undefined });
    });

    it("detects ../file.ts", () => {
      const result = detectFilePath("../file.ts");
      expect(result).toEqual({ path: "../file.ts", line: undefined });
    });

    it("detects ./src/store.ts", () => {
      const result = detectFilePath("./src/store.ts");
      expect(result).toEqual({ path: "./src/store.ts", line: undefined });
    });

    it("detects ./src/utils/helper.ts:42", () => {
      const result = detectFilePath("./src/utils/helper.ts:42");
      expect(result).toEqual({ path: "./src/utils/helper.ts", line: 42 });
    });

    it("detects ../components/button.tsx:10:5", () => {
      const result = detectFilePath("../components/button.tsx:10:5");
      expect(result).toEqual({ path: "../components/button.tsx", line: 10 });
    });
  });

  describe("should detect source directory paths", () => {
    it("detects src/store.ts", () => {
      const result = detectFilePath("src/store.ts");
      expect(result).toEqual({ path: "src/store.ts", line: undefined });
    });

    it("detects app/components/button.tsx", () => {
      const result = detectFilePath("app/components/button.tsx");
      expect(result).toEqual({ path: "app/components/button.tsx", line: undefined });
    });

    it("detects lib/utils.ts:25", () => {
      const result = detectFilePath("lib/utils.ts:25");
      expect(result).toEqual({ path: "lib/utils.ts", line: 25 });
    });

    it("detects components/ui/card.tsx", () => {
      const result = detectFilePath("components/ui/card.tsx");
      expect(result).toEqual({ path: "components/ui/card.tsx", line: undefined });
    });

    it("detects api/users.ts", () => {
      const result = detectFilePath("api/users.ts");
      expect(result).toEqual({ path: "api/users.ts", line: undefined });
    });

    it("detects test/example.test.ts", () => {
      const result = detectFilePath("test/example.test.ts");
      expect(result).toEqual({ path: "test/example.test.ts", line: undefined });
    });

    it("detects types/index.ts", () => {
      const result = detectFilePath("types/index.ts");
      expect(result).toEqual({ path: "types/index.ts", line: undefined });
    });

    it("detects hooks/useAuth.ts", () => {
      const result = detectFilePath("hooks/useAuth.ts");
      expect(result).toEqual({ path: "hooks/useAuth.ts", line: undefined });
    });
  });

  describe("should detect absolute paths", () => {
    it("detects /Users/name/project/file.ts", () => {
      const result = detectFilePath("/Users/name/project/file.ts");
      expect(result).toEqual({ path: "/Users/name/project/file.ts", line: undefined });
    });

    it("detects /home/user/src/main.ts:100", () => {
      const result = detectFilePath("/home/user/src/main.ts:100");
      expect(result).toEqual({ path: "/home/user/src/main.ts", line: 100 });
    });

    it("detects /var/log/app.log", () => {
      // Note: "log" extension is not in the valid extensions list
      const result = detectFilePath("/var/log/app.log");
      expect(result).toBeNull();
    });

    it("detects /tmp/test.txt", () => {
      const result = detectFilePath("/tmp/test.txt");
      expect(result).toEqual({ path: "/tmp/test.txt", line: undefined });
    });
  });

  describe("should detect various file extensions", () => {
    const extensions = [
      // JavaScript/TypeScript
      { ext: "js", example: "file.js" },
      { ext: "mjs", example: "file.mjs" },
      { ext: "cjs", example: "file.cjs" },
      { ext: "ts", example: "file.ts" },
      { ext: "mts", example: "file.mts" },
      { ext: "cts", example: "file.cts" },
      { ext: "tsx", example: "file.tsx" },
      { ext: "jsx", example: "file.jsx" },
      // Python
      { ext: "py", example: "file.py" },
      { ext: "pyi", example: "file.pyi" },
      // Java/Kotlin
      { ext: "java", example: "Main.java" },
      { ext: "kt", example: "Main.kt" },
      { ext: "kts", example: "script.kts" },
      // C/C++/C#/Go/Rust
      // Note: single char extensions (c, h) are not supported (requires ext.length >= 2)
      { ext: "cpp", example: "main.cpp" },
      { ext: "hpp", example: "header.hpp" },
      { ext: "cc", example: "main.cc" },
      { ext: "cs", example: "Program.cs" },
      { ext: "go", example: "main.go" },
      { ext: "rs", example: "main.rs" },
      // Ruby/PHP/Lua
      { ext: "rb", example: "Gemfile.rb" },
      { ext: "erb", example: "view.erb" },
      { ext: "php", example: "index.php" },
      { ext: "lua", example: "config.lua" },
      // Shell/Config
      { ext: "sh", example: "script.sh" },
      { ext: "bash", example: "script.bash" },
      { ext: "zsh", example: ".zshrc.zsh" },
      { ext: "fish", example: "config.fish" },
      { ext: "ps1", example: "script.ps1" },
      { ext: "json", example: "package.json" },
      { ext: "yaml", example: "config.yaml" },
      { ext: "yml", example: "docker-compose.yml" },
      { ext: "toml", example: "Cargo.toml" },
      { ext: "ini", example: "config.ini" },
      { ext: "conf", example: "nginx.conf" },
      { ext: "config", example: "app.config" },
      // Web
      { ext: "html", example: "index.html" },
      { ext: "htm", example: "page.htm" },
      { ext: "css", example: "styles.css" },
      { ext: "scss", example: "styles.scss" },
      { ext: "sass", example: "styles.sass" },
      { ext: "less", example: "styles.less" },
      // Documentation
      { ext: "md", example: "README.md" },
      { ext: "mdx", example: "page.mdx" },
      { ext: "rst", example: "docs.rst" },
      { ext: "txt", example: "notes.txt" },
      // Other code
      { ext: "swift", example: "main.swift" },
      { ext: "scala", example: "Main.scala" },
      { ext: "clj", example: "core.clj" },
      { ext: "cljs", example: "core.cljs" },
      { ext: "erl", example: "module.erl" },
      { ext: "ex", example: "module.ex" },
      { ext: "exs", example: "script.exs" },
      { ext: "hs", example: "Main.hs" },
      { ext: "lhs", example: "Main.lhs" },
      { ext: "ml", example: "module.ml" },
      { ext: "mli", example: "module.mli" },
      { ext: "fs", example: "Program.fs" },
      { ext: "fsx", example: "script.fsx" },
      // Build/Config files
      { ext: "dockerfile", example: "Dockerfile.dockerfile" },
      { ext: "makefile", example: "Makefile.makefile" },
      { ext: "cmake", example: "CMakeLists.cmake" },
      { ext: "gradle", example: "build.gradle" },
    ];

    extensions.forEach(({ ext, example }) => {
      it(`detects ${ext} extension`, () => {
        const result = detectFilePath(`src/${example}`);
        expect(result).toEqual({ path: `src/${example}`, line: undefined });
      });
    });

    it("detects numeric extensions (e.g., file.10)", () => {
      // Note: numeric extensions require at least 2 digits (ext.length >= 2)
      const result = detectFilePath("docs/file.10");
      expect(result).toEqual({ path: "docs/file.10", line: undefined });
    });
  });

  describe("should reject invalid paths", () => {
    it("rejects URLs with http://", () => {
      const result = detectFilePath("http://example.com/file.ts");
      expect(result).toBeNull();
    });

    it("rejects URLs with https://", () => {
      const result = detectFilePath("https://example.com/file.ts");
      expect(result).toBeNull();
    });

    it("rejects paths with //", () => {
      const result = detectFilePath("path//to/file.ts");
      expect(result).toBeNull();
    });

    it("rejects paths without extension", () => {
      const result = detectFilePath("src/utils");
      expect(result).toBeNull();
    });

    it("rejects paths with invalid single-letter extension", () => {
      const result = detectFilePath("file.a");
      expect(result).toBeNull();
    });

    it("rejects paths with ...", () => {
      const result = detectFilePath("....");
      expect(result).toBeNull();
    });

    it("rejects just .", () => {
      const result = detectFilePath(".");
      expect(result).toBeNull();
    });

    it("rejects just ..", () => {
      const result = detectFilePath("..");
      expect(result).toBeNull();
    });

    it("rejects unknown extensions", () => {
      const result = detectFilePath("file.unknown");
      expect(result).toBeNull();
    });

    it("rejects extensions that look like domains", () => {
      const result = detectFilePath("example.com");
      expect(result).toBeNull();
    });

    it("rejects extensions that look like domains with path", () => {
      const result = detectFilePath("path/to/example.io");
      expect(result).toBeNull();
    });
  });

  describe("should handle edge cases", () => {
    it("handles empty string", () => {
      const result = detectFilePath("");
      expect(result).toBeNull();
    });

    it("handles string with only line number", () => {
      const result = detectFilePath(":42");
      expect(result).toBeNull();
    });

    it("handles trailing colons on valid paths", () => {
      const result = detectFilePath("src/file.ts:::");
      expect(result).toEqual({ path: "src/file.ts", line: undefined });
    });

    it("handles paths with hyphens", () => {
      const result = detectFilePath("src/my-file.ts");
      expect(result).toEqual({ path: "src/my-file.ts", line: undefined });
    });

    it("handles paths with underscores", () => {
      const result = detectFilePath("src/my_file.ts");
      expect(result).toEqual({ path: "src/my_file.ts", line: undefined });
    });

    it("handles paths with dots in directory names", () => {
      const result = detectFilePath("./.config/file.ts");
      expect(result).toEqual({ path: "./.config/file.ts", line: undefined });
    });
  });
});
