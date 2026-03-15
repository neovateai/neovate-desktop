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

function searchContentWithMatches(
  rgPath: string,
  cwd: string,
  query: string,
  caseSensitive: boolean,
  exactMatch: boolean,
): Promise<SearchResult[]> {
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
      "!.git/**",
      "--glob",
      "!dist/**",
      "--glob",
      "!build/**",
    ];

    if (!caseSensitive) {
      args.push("--ignore-case");
    }

    if (exactMatch) {
      args.push("--word-regexp");
    }

    args.push(query);
    args.push(cwd);

    execFile(rgPath, args, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) {
        if (err.message.includes("exit code 1")) {
          resolve([]);
          return;
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
        } catch (e) {
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

      resolve(results);
    });
  });
}

export async function searchWithContent(
  cwd: string,
  query: string,
  caseSensitive = false,
  exactMatch = false,
  maxResults = 100,
): Promise<{ results: SearchResult[] }> {
  log(
    "searchWithContent cwd=%s query=%s caseSensitive=%s exactMatch=%s",
    cwd,
    query,
    caseSensitive,
    exactMatch,
  );

  const results = await searchContentWithMatches(
    resolveRgPath(),
    cwd,
    query,
    caseSensitive,
    exactMatch,
  );
  const truncatedResults = results.slice(0, maxResults);

  log("searchWithContent result: %d files", truncatedResults.length);
  return { results: truncatedResults };
}
