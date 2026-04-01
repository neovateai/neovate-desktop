export interface FilePathInfo {
  path: string;
  line?: number;
  col?: number;
}

export interface FilePathMatch extends FilePathInfo {
  start: number;
  end: number;
}

const EXTENSIONS =
  "tsx?|jsx?|mjs|cjs|py|rs|go|rb|java|kt|swift|c|cpp|h|hpp|cs|php|sh|sql|css|scss|html|xml|svg|vue|svelte|astro|md|mdx|json|ya?ml|toml|env(?:\\.\\w+)?|lock|graphql|prisma";

// Path-safe characters: letters, digits, spaces, and common path symbols
const PATH_CHAR = "[\\w/.~@# -]";

// Match files with known extensions (with optional :line:col) — anchored for exact match
const FILE_EXT_RE = new RegExp(
  `^(${PATH_CHAR}+\\.(?:${EXTENSIONS})|\\.env(?:\\.\\w+)?)(?::(\\d+)(?::(\\d+))?)?$`,
);

// Scan for file paths within text — no spaces (terminal paths are space-delimited), non-anchored
const SCAN_PATH_CHAR = "[\\w/.~@#-]";
const FILE_PATH_SCAN_RE = new RegExp(
  `(?:\\/|~\\/)${SCAN_PATH_CHAR}*\\.(?:${EXTENSIONS})(?::\\d+(?::\\d+)?)?`,
  "g",
);

export function isFilePath(text: string): boolean {
  return parseFilePath(text) !== null;
}

// Only match absolute paths (/) and home-relative paths (~/) for now.
// TODO: support project-relative paths (e.g. src/App.tsx) by resolving against session projectPath
export function parseFilePath(text: string): FilePathInfo | null {
  if (!text.startsWith("/") && !text.startsWith("~/")) return null;

  const match = FILE_EXT_RE.exec(text);
  if (!match) return null;
  return {
    path: match[1],
    line: match[2] ? Number(match[2]) : undefined,
    col: match[3] ? Number(match[3]) : undefined,
  };
}

export function findFilePathsInText(text: string): FilePathMatch[] {
  const results: FilePathMatch[] = [];
  FILE_PATH_SCAN_RE.lastIndex = 0;
  let match;
  while ((match = FILE_PATH_SCAN_RE.exec(text)) !== null) {
    // Boundary: preceding char must be start-of-string, whitespace, or delimiter
    // This prevents matching paths inside URLs (e.g. https://example.com/path.html)
    if (match.index > 0 && !/[\s'"`([,;]/.test(text[match.index - 1])) continue;

    const parsed = parseFilePath(match[0]);
    if (parsed) {
      results.push({ ...parsed, start: match.index, end: match.index + match[0].length });
    }
  }
  return results;
}
