import debug from "debug";
import { execFile } from "node:child_process";
import { relative, basename, extname } from "node:path";

import { resolveRgPath } from "./search-paths";

const log = debug("neovate:search-content");

interface ContentMatch {
  line: number;
  column: number;
  text: string;
}

interface SearchResult {
  fullPath: string;
  relPath: string;
  fileName: string;
  extName: string;
  matches?: ContentMatch[];
}

interface SearchResponse {
  results: SearchResult[];
  error?: string;
}

function containsChinese(str: string): boolean {
  return /[\u4e00-\u9fff]/.test(str);
}

function searchContentWithMatches(
  rgPath: string,
  cwd: string,
  query: string,
  caseSensitive: boolean,
  exactMatch: boolean,
  useRegex: boolean,
): Promise<SearchResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      "--json",
      "--line-number",
      "--column",
      "--with-filename",
      "--null",
      "--hidden",
      "--glob",
      "!node_modules/**",
      "--glob",
      "!.git/",
      "--glob",
      "!dist/**",
      "--glob",
      "!build/**",
    ];

    if (!caseSensitive) {
      args.push("--ignore-case");
    }

    if (exactMatch) {
      const isContainsChinese = containsChinese(query); // 中文场景下，全词匹配逻辑不生效（中文无准确分词处理）
      if (!isContainsChinese) {
        args.push("--word-regexp");
      }
    }

    // Use fixed-strings mode by default to treat query as literal string
    // Only use regex mode when user explicitly enables it
    if (!useRegex) {
      args.push("--fixed-strings");
    }

    args.push(query);
    args.push(cwd);

    execFile(rgPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout) {
        if (err.message.includes("exit code 1")) {
          resolve({ results: [] });
          return;
        }
        // Check for regex error in stderr
        if (stderr && useRegex) {
          const regexErrorMatch = stderr.match(/regex\s+(.+?)\s+did not parse:/i);
          if (regexErrorMatch) {
            resolve({ results: [], error: `Invalid regex: ${regexErrorMatch[1]}` });
            return;
          }
          // Generic regex error
          if (stderr.includes("did not parse") || stderr.includes("invalid")) {
            resolve({ results: [], error: "Invalid regular expression" });
            return;
          }
        }
        reject(err);
        return;
      }

      const results: SearchResult[] = [];
      const fileMap = new Map<string, ContentMatch[]>();

      const lines = stdout.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const data = JSON.parse(line);

          if (data.type === "match") {
            const fullPath = data.data.path.text;

            if (!fileMap.has(fullPath)) {
              fileMap.set(fullPath, []);
            }

            for (const submatch of data.data.submatches) {
              fileMap.get(fullPath)!.push({
                line: data.data.line_number,
                column: submatch.start,
                text: data.data.lines.text,
              });
            }
          }
        } catch (_e) {
          log("Failed to parse JSON line: %s", line);
        }
      }

      for (const [fullPath, matches] of fileMap.entries()) {
        results.push({
          fullPath,
          relPath: relative(cwd, fullPath),
          fileName: basename(fullPath),
          extName: extname(fullPath),
          matches: matches.slice(0, 10), // limit matches per file
        });
      }

      resolve({ results });
    });
  });
}

export async function searchWithContent(
  cwd: string,
  query: string,
  caseSensitive = false,
  exactMatch = false,
  useRegex = false,
  maxResults = 100,
): Promise<SearchResponse> {
  log(
    "searchWithContent cwd=%s query=%s caseSensitive=%s exactMatch=%s useRegex=%s",
    cwd,
    query,
    caseSensitive,
    exactMatch,
    useRegex,
  );

  const response = await searchContentWithMatches(
    resolveRgPath(),
    cwd,
    query,
    caseSensitive,
    exactMatch,
    useRegex,
  );
  const truncatedResults = response.results.slice(0, maxResults);

  log("searchWithContent result: %d files", truncatedResults.length);
  return { results: truncatedResults, error: response.error };
}
