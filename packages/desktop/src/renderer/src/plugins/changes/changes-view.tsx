import { MultiFileDiff } from "@pierre/diffs/react";
import {
  AlertTriangle,
  Bot,
  ChevronDown,
  ChevronRight,
  Columns2,
  Ellipsis,
  FileCheck,
  GitBranch,
  RefreshCw,
  AlignJustify,
} from "lucide-react";
import { useTheme } from "next-themes";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Popover, PopoverTrigger, PopoverPopup } from "../../components/ui/popover";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectPopup,
  SelectItem,
} from "../../components/ui/select";
import { usePluginContext } from "../../core/app";
import { useContentPanelViewContext } from "../../features/content-panel";
import { useProjectStore } from "../../features/project/store";
import { useIntersectionObserver } from "../../hooks/use-intersection-observer";
import { useActiveSession } from "../../hooks/useActiveSession";
import { useChanges, type ChangesCategory, type ChangesFile } from "./hooks/useChanges";
import { useChangesTranslation } from "./i18n";

type DiffStyle = "unified" | "split";

const FILE_SIZE_LIMIT = 1_000_000; // 1MB
const LARGE_DIFF_THRESHOLD = 200_000; // 200KB — soft gate for large diffs
const HIGH_FILE_COUNT = 200;

const GENERATED_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "Gemfile.lock",
  "poetry.lock",
  "composer.lock",
  "go.sum",
  "Pipfile.lock",
  "pdm.lock",
  "flake.lock",
]);
const isGenerated = (fileName: string) => GENERATED_FILES.has(fileName);

// L3: Viewport-aware diff rendering — only mounts MultiFileDiff when visible
function LazyDiffContent({
  file,
  diff,
  options,
  forceVisible,
  lastHeight,
  onHeightChange,
}: {
  file: ChangesFile;
  diff: { oldContent: string; newContent: string };
  options: Record<string, unknown>;
  forceVisible: boolean;
  lastHeight?: number;
  onHeightChange: (height: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInViewport = useIntersectionObserver(containerRef, { rootMargin: "200px" });
  const shouldRender = forceVisible || isInViewport;

  useEffect(() => {
    if (shouldRender && containerRef.current) {
      const height = containerRef.current.offsetHeight;
      if (height > 0) onHeightChange(height);
    }
  }, [shouldRender, diff]);

  return (
    <div ref={containerRef}>
      {shouldRender ? (
        <MultiFileDiff
          oldFile={{ name: file.fileName, contents: diff.oldContent }}
          newFile={{ name: file.fileName, contents: diff.newContent }}
          options={options}
        />
      ) : (
        <div style={{ height: lastHeight ?? 80 }} />
      )}
    </div>
  );
}

export default memo(function ChangesView() {
  const { t } = useChangesTranslation();
  const { app } = usePluginContext();
  const { resolvedTheme } = useTheme();
  const activeProject = useProjectStore((s) => s.activeProject);
  const { sessionId } = useActiveSession();
  const { viewId, viewState: savedState, isActive } = useContentPanelViewContext();

  const [category, setCategory] = useState<ChangesCategory>(
    (savedState.category as ChangesCategory) || "unstaged",
  );
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(
    (savedState.diffStyle as DiffStyle) || "unified",
  );
  const [showFileTree, setShowFileTree] = useState(!!savedState.showFileTree);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [forceVisibleFiles, setForceVisibleFiles] = useState<Set<string>>(new Set());
  const [diffHeights, setDiffHeights] = useState<Record<string, number>>({});
  const [forceShownFiles, setForceShownFiles] = useState<Set<string>>(new Set());

  const { files, loading, error, branchInfo, diffs, loadingDiffs, refresh, loadDiff } =
    useChanges(category);

  // L1: Memoize diff options to avoid unnecessary MultiFileDiff re-renders
  const diffOptions = useMemo(
    () => ({
      theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
      diffStyle,
      expandUnchanged: false,
      expansionLineCount: 20,
      tokenizeMaxLineLength: 500,
    }),
    [resolvedTheme, diffStyle],
  );

  // Fetch branch info for the select label even when not on branch category
  const [selectBranchLabel, setSelectBranchLabel] = useState<string | null>(null);
  const [selectBranchDisabled, setSelectBranchDisabled] = useState(false);

  const { orpcClient } = usePluginContext();
  useEffect(() => {
    if (!activeProject?.path) return;
    const client = orpcClient as any;
    client.git
      .branchFiles({ cwd: activeProject.path })
      .then((res: any) => {
        if (res.success && res.data) {
          setSelectBranchLabel(`${res.data.local} > ${res.data.tracking}`);
          setSelectBranchDisabled(false);
        } else {
          setSelectBranchLabel(null);
          setSelectBranchDisabled(true);
        }
      })
      .catch(() => {
        setSelectBranchLabel(null);
        setSelectBranchDisabled(true);
      });
  }, [activeProject?.path]);

  // Persist state changes
  const persistState = useCallback(
    (patch: Record<string, unknown>) => {
      app.workbench.contentPanel.updateViewState(viewId, patch);
    },
    [app, viewId],
  );

  const handleCategoryChange = (value: ChangesCategory) => {
    setCategory(value);
    setExpandedFiles(new Set());
    setForceShownFiles(new Set());
    persistState({ category: value });
  };

  const toggleDiffStyle = () => {
    const next = diffStyle === "unified" ? "split" : "unified";
    setDiffStyle(next);
    persistState({ diffStyle: next });
  };

  const toggleFileTree = () => {
    const next = !showFileTree;
    setShowFileTree(next);
    persistState({ showFileTree: next });
  };

  const toggleFile = (file: ChangesFile) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file.relPath)) {
        next.delete(file.relPath);
      } else {
        next.add(file.relPath);
        if (!isGenerated(file.fileName) || forceShownFiles.has(file.relPath)) {
          loadDiff(file.relPath);
        }
      }
      return next;
    });
  };

  // L4: Progressive expand all — batch 10 files at a time with idle callbacks
  const expandAll = () => {
    if (files.length > HIGH_FILE_COUNT) {
      if (!window.confirm(t("review.expandAllConfirm", { count: files.length }))) return;
    }

    const nonGenerated = files.filter((f) => !isGenerated(f.fileName));
    const ordered = nonGenerated.map((f) => f.relPath);

    // Expand all files (including generated), but only load diffs for non-generated
    setExpandedFiles(new Set(files.map((f) => f.relPath)));
    let idx = 0;

    const expandBatch = () => {
      const batch = ordered.slice(idx, idx + 10);
      if (batch.length === 0) return;
      idx += batch.length;

      // 5 concurrent loadDiff per batch (generated files already excluded)
      let loadIdx = 0;
      const loadNext = () => {
        if (loadIdx >= batch.length) return;
        const relPath = batch[loadIdx++];
        if (!diffs[relPath] && !loadingDiffs[relPath]) {
          loadDiff(relPath).then(loadNext);
        } else {
          loadNext();
        }
      };
      for (let i = 0; i < Math.min(5, batch.length); i++) loadNext();

      requestIdleCallback(expandBatch);
    };

    expandBatch();
  };

  const collapseAll = () => {
    setExpandedFiles(new Set());
  };

  // Listen for neovate:open-changes event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ category?: ChangesCategory }>)?.detail;
      if (detail?.category) {
        handleCategoryChange(detail.category);
      }
    };
    window.addEventListener("neovate:open-changes", handler);
    return () => window.removeEventListener("neovate:open-changes", handler);
  }, []);

  // Cmd+R to refresh
  useEffect(() => {
    if (!isActive) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "r") {
        e.preventDefault();
        refresh();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [refresh, isActive]);

  // Scroll to file from file tree — force visible to bypass intersection observer
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const scrollToFile = (file: ChangesFile) => {
    setForceVisibleFiles((prev) => {
      const next = new Set(prev);
      next.add(file.relPath);
      return next;
    });
    if (!expandedFiles.has(file.relPath)) {
      toggleFile(file);
    }
    setTimeout(() => {
      const el = diffContainerRef.current?.querySelector(
        `[data-file-path="${CSS.escape(file.relPath)}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  };

  if (!activeProject) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">{t("review.noProject")}</p>
      </div>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "modified":
        return <span className="text-xs font-medium text-yellow-600">M</span>;
      case "deleted":
        return <span className="text-xs font-medium text-red-600">D</span>;
      case "untracked":
        return <span className="text-xs font-medium text-green-600">U</span>;
      case "added":
        return <span className="text-xs font-medium text-green-600">A</span>;
      default:
        return null;
    }
  };

  const renderError = () => {
    if (category === "last-turn" && error === "no_session") {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <Bot className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("review.noSession")}</p>
        </div>
      );
    }
    if (category === "last-turn" && error?.includes("No turns")) {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <Bot className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("review.noTurns")}</p>
        </div>
      );
    }
    if (category === "branch" && error === "no_upstream") {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <GitBranch className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("review.branchNoUpstreamMsg")}</p>
        </div>
      );
    }
    if (category === "branch" && error === "detached_head") {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <GitBranch className="w-10 h-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t("review.branchDetachedMsg")}</p>
        </div>
      );
    }
    if (category === "branch" && error === "remote_gone") {
      return (
        <div className="h-full flex flex-col items-center justify-center gap-2">
          <GitBranch className="w-10 h-10 text-destructive" />
          <p className="text-sm text-destructive">{t("review.branchRemoteGone")}</p>
        </div>
      );
    }
    if (error) {
      return (
        <div className="h-full flex items-center justify-center">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      );
    }
    return null;
  };

  // L2: File-level guards
  const isBinary = (content: string) => content.slice(0, 8192).includes("\0");
  const isFileTooLarge = (diff: { oldContent: string; newContent: string }) =>
    diff.oldContent.length + diff.newContent.length > FILE_SIZE_LIMIT;
  const isLargeDiff = (diff: { oldContent: string; newContent: string }) =>
    diff.oldContent.length + diff.newContent.length > LARGE_DIFF_THRESHOLD;

  const renderFileDiff = (file: ChangesFile) => {
    const isExpanded = expandedFiles.has(file.relPath);
    const diff = diffs[file.relPath];
    const isLoadingDiff = loadingDiffs[file.relPath];

    return (
      <div
        key={file.relPath}
        data-file-path={file.relPath}
        className="border border-border rounded-md overflow-hidden"
      >
        <div
          className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 cursor-pointer hover:bg-muted select-none"
          onClick={() => toggleFile(file)}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <div
            className="seti-icon shrink-0"
            data-lang={file.extName.toLowerCase()}
            style={{ fontSize: 14 }}
          />
          <span className="text-sm truncate flex-1">{file.relPath}</span>
          {(file.insertions != null || file.deletions != null) && (
            <span className="flex items-center gap-1 text-xs shrink-0">
              {file.insertions != null && file.insertions > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{file.insertions.toLocaleString()}
                </span>
              )}
              {file.deletions != null && file.deletions > 0 && (
                <span className="text-rose-600 dark:text-rose-400">
                  -{file.deletions.toLocaleString()}
                </span>
              )}
            </span>
          )}
          {getStatusBadge(file.status)}
        </div>
        {isExpanded && (
          <div className="overflow-auto">
            {isGenerated(file.fileName) && !forceShownFiles.has(file.relPath) ? (
              <div className="py-6 flex flex-col items-center gap-2">
                <p className="text-sm text-muted-foreground">{t("review.generatedFile")}</p>
                <button
                  className="text-xs text-primary hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setForceShownFiles((prev) => new Set(prev).add(file.relPath));
                    loadDiff(file.relPath);
                  }}
                >
                  {t("review.showDiff")}
                </button>
              </div>
            ) : isLoadingDiff ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : diff ? (
              isBinary(diff.oldContent) || isBinary(diff.newContent) ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t("review.binaryFile")}
                </div>
              ) : isFileTooLarge(diff) ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t("review.fileTooLarge")}
                </div>
              ) : isLargeDiff(diff) && !forceShownFiles.has(file.relPath) ? (
                <div className="py-6 flex flex-col items-center gap-2">
                  <p className="text-sm text-muted-foreground">{t("review.largeDiff")}</p>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setForceShownFiles((prev) => new Set(prev).add(file.relPath));
                    }}
                  >
                    {t("review.showDiff")}
                  </button>
                </div>
              ) : diff.oldContent === "" && diff.newContent === "" ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t("review.noChanges")}
                </div>
              ) : (
                <LazyDiffContent
                  file={file}
                  diff={diff}
                  options={diffOptions}
                  forceVisible={forceVisibleFiles.has(file.relPath)}
                  lastHeight={diffHeights[file.relPath]}
                  onHeightChange={(h) => setDiffHeights((prev) => ({ ...prev, [file.relPath]: h }))}
                />
              )
            ) : null}
          </div>
        )}
      </div>
    );
  };

  const statsLine = () => {
    if (files.length === 0) return null;
    const parts = [t("review.stats", { count: files.length })];
    if (category === "branch" && branchInfo) {
      if (branchInfo.ahead > 0 || branchInfo.behind > 0) {
        parts.push(
          t("review.branchStats", {
            ahead: branchInfo.ahead,
            behind: branchInfo.behind,
            tracking: branchInfo.tracking,
          }),
        );
      }
    }
    return parts.join(" · ");
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b shrink-0">
        <Select
          value={category}
          onValueChange={(val) => handleCategoryChange(val as ChangesCategory)}
        >
          <SelectTrigger size="sm" className="min-w-32 max-w-48 h-7">
            <SelectValue>
              {(value: string | null) => {
                if (!value) return null;
                if (value === "branch") {
                  return selectBranchLabel || t("review.category.branchNoUpstream");
                }
                const keyMap: Record<string, string> = {
                  unstaged: "review.category.unstaged",
                  staged: "review.category.staged",
                  "last-turn": "review.category.lastTurn",
                };
                return keyMap[value] ? t(keyMap[value]) : value;
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value="unstaged">{t("review.category.unstaged")}</SelectItem>
            <SelectItem value="staged">{t("review.category.staged")}</SelectItem>
            <SelectItem value="last-turn" disabled={!sessionId}>
              {t("review.category.lastTurn")}
            </SelectItem>
            <SelectItem value="branch" disabled={selectBranchDisabled}>
              {selectBranchLabel ||
                (selectBranchDisabled ? t("review.category.branchNoUpstream") : "Branch")}
            </SelectItem>
          </SelectPopup>
        </Select>

        <div className="flex-1" />

        {/* Diff style toggle */}
        <button
          onClick={toggleDiffStyle}
          className="p-1 hover:bg-accent rounded"
          title={diffStyle === "unified" ? "Split view" : "Unified view"}
        >
          {diffStyle === "unified" ? (
            <AlignJustify className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Columns2 className="w-3.5 h-3.5 text-muted-foreground" />
          )}
        </button>

        {/* Overflow menu */}
        <Popover>
          <PopoverTrigger className="p-1 hover:bg-accent rounded">
            <Ellipsis className="w-3.5 h-3.5 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverPopup side="bottom" align="end" viewportClassName="p-1">
            <div className="min-w-32">
              <button
                onClick={() => refresh()}
                className="flex w-full select-none items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground [&_svg]:size-4 [&_svg]:shrink-0"
              >
                <RefreshCw />
                {t("review.menu.refresh")}
              </button>
              <button
                onClick={toggleFileTree}
                className="flex w-full select-none items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                {showFileTree ? t("review.menu.hideFileTree") : t("review.menu.showFileTree")}
              </button>
              <div className="mx-2 my-1 h-px bg-border" />
              <button
                onClick={expandAll}
                disabled={files.length === 0}
                className="flex w-full select-none items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-64"
              >
                {t("review.menu.expandAll")}
              </button>
              <button
                onClick={collapseAll}
                disabled={expandedFiles.size === 0}
                className="flex w-full select-none items-center gap-2 rounded-sm px-2 py-1 text-sm hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-64"
              >
                {t("review.menu.collapseAll")}
              </button>
            </div>
          </PopoverPopup>
        </Popover>
      </div>

      {/* Stats line */}
      {!loading && !error && files.length > 0 && (
        <div className="px-3 py-1 text-xs text-muted-foreground border-b shrink-0">
          {statsLine()}
        </div>
      )}

      {/* L2: High file count warning */}
      {!loading && !error && files.length > HIGH_FILE_COUNT && (
        <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950 border-b shrink-0">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          {t("review.highFileCount", { count: files.length })}
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Diff area */}
        <div ref={diffContainerRef} className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-2">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-muted-foreground">{t("review.loading")}</p>
              </div>
            </div>
          ) : error ? (
            renderError()
          ) : files.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2">
              {category === "last-turn" ? (
                <Bot className="w-10 h-10 text-muted-foreground" />
              ) : category === "branch" ? (
                <GitBranch className="w-10 h-10 text-muted-foreground" />
              ) : (
                <FileCheck className="w-10 h-10 text-muted-foreground" />
              )}
              <p className="text-sm font-medium text-muted-foreground">
                {t(`review.empty.${category}.title`)}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {category === "branch" && branchInfo
                  ? t("review.branchUpToDate", {
                      tracking: branchInfo.tracking,
                    })
                  : t(`review.empty.${category}.description`)}
              </p>
            </div>
          ) : (
            files.map(renderFileDiff)
          )}
        </div>

        {/* File tree sidebar */}
        {showFileTree && files.length > 0 && (
          <div className="w-48 border-l overflow-y-auto shrink-0">
            <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground border-b">
              Files
            </div>
            {files.map((file) => (
              <div
                key={file.relPath}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer hover:bg-accent/50 truncate ${
                  expandedFiles.has(file.relPath) ? "bg-accent/30" : ""
                }`}
                title={file.relPath}
                onClick={() => scrollToFile(file)}
              >
                <div
                  className="seti-icon shrink-0"
                  data-lang={file.extName.toLowerCase()}
                  style={{ fontSize: 12 }}
                />
                <span className="truncate flex-1">{file.fileName}</span>
                {getStatusBadge(file.status)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});
