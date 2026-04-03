import { describe, it, expect } from "vitest";

import { truncateDiff } from "../../plugins/git/hooks/truncate";

describe("truncateDiff", () => {
  it("returns original diff if under limit", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 line1
+line2
 line3
 line4`;

    const result = truncateDiff(diff);
    expect(result).toBe(diff);
  });

  it("preserves complete file headers when truncating", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,100 +1,100 @@
${"line content\n".repeat(200)}`;

    const result = truncateDiff(diff);
    expect(result).toContain("diff --git a/file.txt b/file.txt");
    expect(result).toContain("index 1234567..abcdefg 100644");
    expect(result).toContain("--- a/file.txt");
    expect(result).toContain("+++ b/file.txt");
  });

  it("preserves hunk headers when truncating", () => {
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,100 +1,100 @@
${"line content\n".repeat(200)}`;

    const result = truncateDiff(diff);
    expect(result).toContain("@@ -1,100 +1,100 @@");
  });

  it("handles binary files", () => {
    const diff = `diff --git a/image.png b/image.png
index 1234567..abcdefg 100644
Binary files a/image.png and b/image.png differ`;

    const result = truncateDiff(diff);
    expect(result).toBe(diff);
    expect(result).toContain("Binary files a/image.png and b/image.png differ");
  });

  it("handles git binary patch format", () => {
    const diff = `diff --git a/binary.bin b/binary.bin
index 1234567..abcdefg 100644
GIT binary patch
literal 1234
zcmeAS@N1olTTxPaxIW^f!T4VXf7Ytq${"x".repeat(1000)}`;

    const result = truncateDiff(diff);
    expect(result).toContain("GIT binary patch");
  });

  it("handles new file mode", () => {
    const diff = `diff --git a/newfile.txt b/newfile.txt
new file mode 100644
index 0000000..abcdefg
--- /dev/null
+++ b/newfile.txt
@@ -0,0 +1,5 @@
+line1
+line2
+line3`;

    const result = truncateDiff(diff);
    expect(result).toContain("new file mode 100644");
    expect(result).toContain("--- /dev/null");
  });

  it("handles deleted file mode", () => {
    const diff = `diff --git a/oldfile.txt b/oldfile.txt
deleted file mode 100644
index 1234567..0000000
--- a/oldfile.txt
+++ /dev/null
@@ -1,3 +0,0 @@
-line1
-line2
-line3`;

    const result = truncateDiff(diff);
    expect(result).toContain("deleted file mode 100644");
    expect(result).toContain("+++ /dev/null");
  });

  it("handles multiple diff blocks", () => {
    const diff = `diff --git a/file1.txt b/file1.txt
index 1111111..2222222 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1,3 +1,3 @@
 a
 b
 c
diff --git a/file2.txt b/file2.txt
index 3333333..4444444 100644
--- a/file2.txt
+++ b/file2.txt
@@ -1,3 +1,3 @@
 d
 e
 f`;

    const result = truncateDiff(diff);
    expect(result).toContain("diff --git a/file1.txt b/file1.txt");
    expect(result).toContain("diff --git a/file2.txt b/file2.txt");
  });

  it("truncates long multi-block diff with marker", () => {
    const block1 = `diff --git a/file1.txt b/file1.txt
index 1111111..2222222 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1,100 +1,100 @@
${"content line with some more text to make it longer\n".repeat(150)}`;

    const block2 = `diff --git a/file2.txt b/file2.txt
index 3333333..4444444 100644
--- a/file2.txt
+++ b/file2.txt
@@ -1,100 +1,100 @@
${"more content with additional text here\n".repeat(150)}`;

    const diff = block1 + block2;
    expect(diff.length).toBeGreaterThan(8000);

    const result = truncateDiff(diff);

    expect(result.length).toBeLessThanOrEqual(8000);
    expect(result).toContain("diff --git a/file1.txt b/file1.txt");
    expect(result).toContain("[内容过长已截断");
  });

  it("handles mode change", () => {
    const diff = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755`;

    const result = truncateDiff(diff);
    expect(result).toContain("old mode 100644");
    expect(result).toContain("new mode 100755");
  });

  // 边界场景测试
  it("returns empty string for empty input", () => {
    const result = truncateDiff("");
    expect(result).toBe("");
  });

  it("returns original diff when exactly at limit", () => {
    const header = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
`;
    const content = "x".repeat(8000 - header.length);
    const diff = header + content;

    expect(diff.length).toBe(8000);
    const result = truncateDiff(diff);
    expect(result).toBe(diff);
  });

  it("handles just over limit (8001 chars)", () => {
    const header = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
`;
    const content = "x".repeat(8001 - header.length);
    const diff = header + content;

    expect(diff.length).toBe(8001);
    const result = truncateDiff(diff);
    expect(result.length).toBeLessThanOrEqual(8000);
    expect(result).toContain("diff --git a/file.txt b/file.txt");
  });

  it("handles renamed files", () => {
    const diff = `diff --git a/old.txt b/new.txt
similarity index 100%
rename from old.txt
rename to new.txt`;

    const result = truncateDiff(diff);
    expect(result).toContain("rename from old.txt");
    expect(result).toContain("rename to new.txt");
  });

  it("handles similarity index with content changes", () => {
    const diff = `diff --git a/old.txt b/new.txt
similarity index 80%
rename from old.txt
rename to new.txt
index 1234567..abcdefg 100644
--- a/old.txt
+++ b/new.txt
@@ -1,3 +1,4 @@
 line1
+line2
 line3`;

    const result = truncateDiff(diff);
    expect(result).toContain("similarity index 80%");
    expect(result).toContain("rename from old.txt");
    expect(result).toContain("rename to new.txt");
  });

  it("handles extremely long file path that exceeds limit", () => {
    const longPath = "a/".repeat(500) + "file.txt";
    const diff = `diff --git ${longPath} ${longPath}
--- ${longPath}
+++ ${longPath}
@@ -1 +1 @@
-content
+new content`;

    const result = truncateDiff(diff);
    expect(result.length).toBeLessThanOrEqual(8000);
    expect(result).toContain("diff --git");
  });

  it("handles multiple files with total length just over limit", () => {
    const block1 = `diff --git a/file1.txt b/file1.txt
index 1111111..2222222 100644
--- a/file1.txt
+++ b/file1.txt
@@ -1,100 +1,100 @@
${"content line\n".repeat(100)}`;
    const block2 = `diff --git a/file2.txt b/file2.txt
index 3333333..4444444 100644
--- a/file2.txt
+++ b/file2.txt
@@ -1,100 +1,100 @@
${"more content\n".repeat(100)}`;

    const diff = block1 + block2;
    // 确保刚好超过限制
    const paddedDiff = diff + "x".repeat(Math.max(0, 8001 - diff.length));

    const result = truncateDiff(paddedDiff);
    expect(result.length).toBeLessThanOrEqual(8000);
    expect(result).toContain("diff --git a/file1.txt");
  });

  it("truncation marker appears when content is truncated", () => {
    const diff = "x".repeat(10000);
    const result = truncateDiff(diff);
    expect(result).toContain("[内容过长已截断");
  });

  it("preserves line integrity - no partial lines in output", () => {
    const line = "complete line content here\n";
    const diff = `diff --git a/file.txt b/file.txt
index 1234567..abcdefg 100644
--- a/file.txt
+++ b/file.txt
@@ -1,1000 +1,1000 @@
${line.repeat(200)}`;

    const result = truncateDiff(diff);
    const lines = result.split("\n");

    // 检查非截断标记的行都是完整的（以预期前缀开头或为空）
    for (const l of lines) {
      if (l.includes("[内容过长已截断")) continue;
      // 有效行：空行、diff header、hunk header、或正常内容
      const isValidLine =
        l === "" ||
        l.startsWith("diff --git") ||
        l.startsWith("index ") ||
        l.startsWith("---") ||
        l.startsWith("+++") ||
        l.startsWith("@@") ||
        l.startsWith("complete line content here");
      expect(isValidLine).toBe(true);
    }
  });
});
