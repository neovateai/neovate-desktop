export interface FilePathInfo {
  path: string;
  line?: number;
  col?: number;
}

// Path-safe characters: letters, digits, spaces, and common path symbols
const PATH_CHAR = "[\\w/.~@# -]";

// Match files with known extensions (with optional :line:col)
const FILE_EXT_RE = new RegExp(
  `^(${PATH_CHAR}+\\.(?:tsx?|jsx?|mjs|cjs|py|rs|go|rb|java|kt|swift|c|cpp|h|hpp|cs|php|sh|sql|css|scss|html|xml|svg|vue|svelte|astro|md|mdx|json|ya?ml|toml|env(?:\\.\\w+)?|lock|graphql|prisma)|\\.env(?:\\.\\w+)?)(?::(\\d+)(?::(\\d+))?)?$`,
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
