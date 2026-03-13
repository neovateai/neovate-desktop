import { MultiFileDiff } from "@pierre/diffs/react";
import {
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
import { memo, useCallback, useEffect, useRef, useState } from "react";

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
import { useActiveSession } from "../../hooks/useActiveSession";
import { useReview, type ReviewCategory, type ReviewFile } from "./hooks/useReview";
import { useReviewTranslation } from "./i18n";

type DiffStyle = "unified" | "split";

export default memo(function ReviewView() {
  const { t } = useReviewTranslation();
  const { app } = usePluginContext();
  const { resolvedTheme } = useTheme();
  const activeProject = useProjectStore((s) => s.activeProject);
  const { sessionId } = useActiveSession();
  const { viewId, viewState: savedState } = useContentPanelViewContext();

  const [category, setCategory] = useState<ReviewCategory>(
    (savedState.category as ReviewCategory) || "unstaged",
  );
  const [diffStyle, setDiffStyle] = useState<DiffStyle>(
    (savedState.diffStyle as DiffStyle) || "unified",
  );
  const [showFileTree, setShowFileTree] = useState(!!savedState.showFileTree);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const { files, loading, error, branchInfo, diffs, loadingDiffs, refresh, loadDiff } =
    useReview(category);

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

  const handleCategoryChange = (value: ReviewCategory) => {
    setCategory(value);
    setExpandedFiles(new Set());
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

  const toggleFile = (relPath: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(relPath)) {
        next.delete(relPath);
      } else {
        next.add(relPath);
        loadDiff(relPath);
      }
      return next;
    });
  };

  const expandAll = () => {
    const allPaths = new Set(files.map((f) => f.relPath));
    setExpandedFiles(allPaths);
    // Batch load diffs with concurrency limit
    const toLoad = files.filter((f) => !diffs[f.relPath] && !loadingDiffs[f.relPath]);
    let idx = 0;
    const loadNext = () => {
      if (idx >= toLoad.length) return;
      const file = toLoad[idx++];
      loadDiff(file.relPath).then(loadNext);
    };
    // Start 5 concurrent loaders
    for (let i = 0; i < Math.min(5, toLoad.length); i++) loadNext();
  };

  const collapseAll = () => {
    setExpandedFiles(new Set());
  };

  // Listen for neovate:open-review event
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ category?: ReviewCategory }>)?.detail;
      if (detail?.category) {
        handleCategoryChange(detail.category);
      }
    };
    window.addEventListener("neovate:open-review", handler);
    return () => window.removeEventListener("neovate:open-review", handler);
  }, []);

  // Scroll to file from file tree
  const diffContainerRef = useRef<HTMLDivElement>(null);
  const scrollToFile = (relPath: string) => {
    if (!expandedFiles.has(relPath)) {
      toggleFile(relPath);
    }
    setTimeout(() => {
      const el = diffContainerRef.current?.querySelector(
        `[data-file-path="${CSS.escape(relPath)}"]`,
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

  const renderFileDiff = (file: ReviewFile) => {
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
          onClick={() => toggleFile(file.relPath)}
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
          {getStatusBadge(file.status)}
        </div>
        {isExpanded && (
          <div className="overflow-auto">
            {isLoadingDiff ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : diff ? (
              diff.oldContent === "" && diff.newContent === "" ? (
                <div className="py-4 text-center text-sm text-muted-foreground">
                  {t("review.noChanges")}
                </div>
              ) : (
                <MultiFileDiff
                  oldFile={{ name: file.fileName, contents: diff.oldContent }}
                  newFile={{ name: file.fileName, contents: diff.newContent }}
                  options={{
                    theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
                    diffStyle,
                  }}
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
          onValueChange={(val) => handleCategoryChange(val as ReviewCategory)}
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
          <PopoverPopup side="bottom" align="end" className="!p-0">
            <div className="py-1 min-w-40">
              <button
                onClick={() => refresh()}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t("review.menu.refresh")}
              </button>
              <button
                onClick={toggleFileTree}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left"
              >
                {showFileTree ? t("review.menu.hideFileTree") : t("review.menu.showFileTree")}
              </button>
              <div className="h-px bg-border mx-2 my-1" />
              <button
                onClick={expandAll}
                disabled={files.length === 0}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left disabled:opacity-50"
              >
                {t("review.menu.expandAll")}
              </button>
              <button
                onClick={collapseAll}
                disabled={expandedFiles.size === 0}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-sm hover:bg-accent text-left disabled:opacity-50"
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
                      interpolation: { escapeValue: false },
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
                onClick={() => scrollToFile(file.relPath)}
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
