import type { ContractRouterClient } from "@orpc/contract";

import { Search, FileText, Loader2, ChevronRight, CaseSensitive, WholeWord } from "lucide-react";
import { useState, useEffect, useRef } from "react";

import type { Project } from "../../../../shared/features/project/types";

import { utilsContract } from "../../../../shared/features/utils/contract";
import { Input } from "../../components/ui/input";
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { cn } from "../../lib/utils";
import { useSearchTranslation } from "./i18n";

// File icon component
function FileLangIcon({ path, size = 14 }: { path: string; size?: number }) {
  const filename = path.split("/").pop() || path;
  const suffix = filename.split(".").pop();

  return (
    <div
      className="seti-icon"
      data-lang={suffix}
      style={{ fontSize: size, width: size, height: size, lineHeight: 1 }}
    ></div>
  );
}

interface SearchViewProps {
  project: Project | null;
}

type UtilsClient = ContractRouterClient<{ utils: typeof utilsContract }>;

interface SearchResult {
  fullPath: string;
  relPath: string;
  fileName: string;
  extName: string;
  matches?: Array<{ line: number; column: number; text: string }>;
}

function SearchViewComponent({ project }: SearchViewProps) {
  const { t } = useSearchTranslation();
  const { orpcClient, app } = usePluginContext();
  const client = orpcClient as UtilsClient;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [expandedResults, setExpandedResults] = useState<Set<string>>(new Set());
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [exactMatch, setExactMatch] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const cwd = project?.path || "";

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setQuery("");
    setResults([]);
    setLoading(false);
    setSearched(false);
    setExpandedResults(new Set());
    setCaseSensitive(false);
    setExactMatch(false);
  }, [cwd]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setResults([]);
      setSearched(false);
      setExpandedResults(new Set());
      return;
    }

    if (trimmedQuery.length === 1) {
      setResults([]);
      setSearched(true);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      handleSearch();
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query, caseSensitive, exactMatch, cwd]);

  const handleSearch = async () => {
    if (!cwd || !query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }

    setLoading(true);
    setSearched(true);

    try {
      const res = await client.utils.searchWithContent({
        cwd,
        query: query.trim(),
        caseSensitive,
        exactMatch,
        maxResults: 100,
      });
      const searchResults = res?.results || [];
      setResults(searchResults);

      const allPaths = new Set<string>();
      searchResults.forEach((result: SearchResult) => {
        if (result.matches && result.matches.length > 0) {
          allPaths.add(result.fullPath);
        }
      });
      setExpandedResults(allPaths);
    } catch (error) {
      console.error("Search failed:", error);
      setResults([]);
      setExpandedResults(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const toggleExpanded = (fullPath: string) => {
    setExpandedResults((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fullPath)) {
        newSet.delete(fullPath);
      } else {
        newSet.add(fullPath);
      }
      return newSet;
    });
  };

  const handleMatchClick = (result: SearchResult, line: number) => {
    app.workbench.contentPanel.openView("editor");
    window.dispatchEvent(
      new CustomEvent("neovate:open-editor", {
        detail: { fullPath: result.fullPath, line },
      }),
    );
    // @ts-ignore 避免 dispatchEvent 时未初始化完成
    window.pendingEditorRequest = { fullPath: item.fullPath, line };
  };

  const highlightMatch = (text: string, searchQuery: string) => {
    if (!searchQuery.trim()) return text;

    let searchText = text;
    let query = searchQuery;

    if (!caseSensitive) {
      searchText = text.toLowerCase();
      query = searchQuery.toLowerCase();
    }

    const queryIndex = searchText.indexOf(query);
    if (queryIndex === -1) return text;

    const queryLength = query.length;
    const start = Math.max(0, queryIndex - 20);
    const end = Math.min(text.length, queryIndex + queryLength + 20);

    let displayText = text.slice(start, end);
    if (start > 0) displayText = "..." + displayText;
    if (end < text.length) displayText = displayText + "...";

    const escapeRegExp = (string: string) => {
      return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const flags = caseSensitive ? "g" : "gi";
    const regex = new RegExp(`(${escapeRegExp(query)})`, flags);
    const parts = displayText.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <span
          key={`match-${i}-${part}`}
          className="bg-yellow-200 dark:bg-yellow-900 text-foreground"
        >
          {part}
        </span>
      ) : (
        <span key={`text-${i}-${part}`}>{part}</span>
      ),
    );
  };

  if (!project) {
    return (
      <div className="flex h-full flex-col p-3">
        <h2 className="text-xs font-semibold text-muted-foreground">{t("title")}</h2>
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-muted-foreground">{t("noProject")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="p-3 border-b border-border">
        <h2 className="text-xs font-semibold text-muted-foreground mb-2">{t("title")}</h2>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t("searchPlaceholder")}
            className="h-8 pl-6 pr-16 text-xs bg-muted rounded-md"
          />
          <div className="absolute right-1.5 top-1/2 -translate-y-1/2 flex items-center gap-0.5">
            <button
              onClick={() => setCaseSensitive(!caseSensitive)}
              className={cn(
                "flex items-center text-xs px-1 py-0.5 rounded transition-all cursor-pointer hover:scale-105",
                caseSensitive
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title={t("caseSensitive")}
            >
              <CaseSensitive className="w-3 h-3" />
            </button>

            <button
              onClick={() => setExactMatch(!exactMatch)}
              className={cn(
                "flex items-center text-xs px-1 py-0.5 rounded transition-all cursor-pointer hover:scale-105",
                exactMatch
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
              title={t("exactMatch")}
            >
              <WholeWord className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden p-3">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mb-2" />
            <p className="text-xs text-muted-foreground">{t("searching")}</p>
          </div>
        ) : searched && query.trim().length === 1 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs text-muted-foreground">{t("performanceWarning")}</p>
          </div>
        ) : searched && results.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32">
            <FileText className="w-8 h-8 mb-2 opacity-50" />
            <p className="text-xs text-muted-foreground">{t("noResults")}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {results.map((result) => (
              <div key={result.fullPath} className="border-b border-border/50 last:border-b-0">
                <div
                  className="flex items-center gap-2 px-2 py-2 hover:bg-accent/50 cursor-pointer rounded"
                  onClick={() => {
                    if (result.matches && result.matches.length > 0) {
                      toggleExpanded(result.fullPath);
                    }
                  }}
                  title={result.relPath}
                >
                  {result.matches && result.matches.length > 0 && (
                    <ChevronRight
                      className={cn(
                        "w-3 h-3 transition-transform",
                        expandedResults.has(result.fullPath) && "rotate-90",
                      )}
                    />
                  )}
                  <div className="flex-shrink-0">
                    <FileLangIcon path={result.fullPath} size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-xs truncate text-foreground">{result.fileName}</div>
                      {result.matches && result.matches.length > 0 && (
                        <div className="flex-shrink-0 text-xs text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                          {t("matchesCount", {
                            count: result.matches.length,
                          })}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{result.relPath}</div>
                  </div>
                </div>
                {result.matches &&
                  result.matches.length > 0 &&
                  expandedResults.has(result.fullPath) && (
                    <div className="pb-2 pl-8 pr-2 space-y-1">
                      {result.matches.map((match, idx) => (
                        <div
                          key={`${result.fullPath}-${match.line}-${match.column}-${idx}`}
                          className="text-xs font-mono bg-muted/50 px-2 py-1 rounded hover:bg-accent cursor-pointer"
                          onClick={() => handleMatchClick(result, match.line)}
                        >
                          <span className="text-muted-foreground">L{match.line}: </span>
                          {highlightMatch(match.text, query)}
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            ))}
            {searched && !loading && results.length > 0 && (
              <div className="text-xs text-muted-foreground text-center pt-2">
                {t("resultsFound", { count: results.length })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SearchView() {
  const activeProject = useProjectStore((state) => state.activeProject);
  return <SearchViewComponent project={activeProject} />;
}
