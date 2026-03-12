const MAX_DIR_LENGTH = 200;

/**
 * Hash a string using the same algorithm as Claude Code (Java's String.hashCode).
 * Used as a suffix when the encoded path exceeds MAX_DIR_LENGTH.
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Encode a project path to the directory name used under `~/.claude/projects/`.
 * Mirrors Claude Code's internal `encodeProjectPath` logic exactly:
 * 1. Replace all non-alphanumeric characters with `-`
 * 2. If the result exceeds 200 characters, truncate and append a hash suffix
 */
export function encodeProjectPath(cwd: string): string {
  const encoded = cwd.replace(/[^a-zA-Z0-9]/g, "-");
  if (encoded.length <= MAX_DIR_LENGTH) return encoded;
  return `${encoded.slice(0, MAX_DIR_LENGTH)}-${hashString(cwd)}`;
}
