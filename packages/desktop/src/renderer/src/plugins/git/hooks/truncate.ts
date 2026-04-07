/** 最大 diff 字符数限制，超过此限制将进行截断 */
const MAX_DIFF_LENGTH = 8000;

/** 截断标记 */
const TRUNCATION_MARKER = "\n\n... [内容过长已截断，完整 diff 请查看终端或 IDE] ...\n\n";

/**
 * 截断过长的 diff 内容
 * 策略：优先保留完整的文件头和 hunk 头（@@ ... @@），确保总长度不超过限制
 */
export function truncateDiff(diff: string): string {
  if (diff.length <= MAX_DIFF_LENGTH) {
    return diff;
  }

  // 按 diff 块分割（diff --git 开头），过滤掉可能的空字符串
  const blocks = diff.split(/(?=diff --git )/).filter(Boolean);
  const result: string[] = [];
  let currentLength = 0;

  for (const block of blocks) {
    // 如果当前块加上已处理长度超过限制，进行截断
    if (currentLength + block.length + TRUNCATION_MARKER.length > MAX_DIFF_LENGTH) {
      // 计算剩余可用空间
      const remaining = MAX_DIFF_LENGTH - currentLength - TRUNCATION_MARKER.length;

      // 至少尝试保留部分内容，避免返回空字符串
      const minRemaining = 50;
      if (remaining > minRemaining) {
        const truncatedBlock = truncateBlock(block, remaining);
        if (truncatedBlock) {
          result.push(truncatedBlock);
        }
      }
      result.push(TRUNCATION_MARKER);
      return result.join("");
    }

    result.push(block);
    currentLength += block.length;
  }

  return result.join("");
}

/**
 * 截断单个 diff 块，优先保留文件头和 hunk 头
 */
function truncateBlock(block: string, maxLength: number): string | null {
  const lines = block.split("\n");
  const headerLines: string[] = [];
  let i = 0;

  // 提取文件头（diff --git, index, ---, +++, mode 等）
  while (i < lines.length) {
    const line = lines[i];
    if (
      line.startsWith("diff --git") ||
      line.startsWith("index ") ||
      line.startsWith("--- ") ||
      line.startsWith("+++ ") ||
      line.startsWith("new file mode") ||
      line.startsWith("deleted file mode") ||
      line.startsWith("old mode") ||
      line.startsWith("new mode") ||
      line.startsWith("Binary files") ||
      line.startsWith("GIT binary patch")
    ) {
      headerLines.push(line);
      i++;
    } else {
      break;
    }
  }

  const header = headerLines.join("\n");
  // header + 换行符的长度（如果 header 非空需要额外换行符与内容分隔）
  const headerTotalLength = header.length + (header.length > 0 ? 1 : 0);

  // 文件头已超限，尝试至少返回文件路径信息
  if (headerTotalLength > maxLength) {
    // 只保留 diff --git 行（文件路径）
    const diffGitLine = headerLines.find((l) => l.startsWith("diff --git"));
    return diffGitLine ?? null;
  }

  // 继续提取 hunk 头（@@ ... @@）和部分内容
  const contentLines: string[] = [];
  let contentLength = headerTotalLength;

  while (i < lines.length) {
    const line = lines[i];
    const lineLength = line.length + 1;

    // hunk 头必须完整保留
    if (line.startsWith("@@")) {
      if (contentLength + lineLength > maxLength) {
        break;
      }
      contentLines.push(line);
      contentLength += lineLength;
      i++;
      continue;
    }

    // 普通内容行
    if (contentLength + lineLength > maxLength) {
      break;
    }
    contentLines.push(line);
    contentLength += lineLength;
    i++;
  }

  if (contentLines.length === 0) {
    return header;
  }

  return header + "\n" + contentLines.join("\n");
}
