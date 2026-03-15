import debug from "debug";
import { Check, ChevronDown, GitBranch, Plus } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import type { GitBranch as GitBranchType } from "../../../../../shared/plugins/git/contract";

import { Popover, PopoverPopup, PopoverTrigger } from "../../../components/ui/popover";
import { Spinner } from "../../../components/ui/spinner";
import { client } from "../../../orpc";
import { CreateBranchDialog } from "./create-branch-dialog";

const log = debug("neovate:branch-switcher");

type Props = {
  cwd: string;
  disabled?: boolean;
};

export function BranchSwitcher({ cwd, disabled }: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [branches, setBranches] = useState<GitBranchType[]>([]);
  const [currentBranch, setCurrentBranch] = useState<string | null>(null);
  const [detachedHead, setDetachedHead] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [isGitRepo, setIsGitRepo] = useState(true);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchBranches = useCallback(
    async (searchQuery = "") => {
      log("fetchBranches: cwd=%s query=%s", cwd, searchQuery);
      setLoading(true);
      setError(null);
      try {
        const result = await client.git.branches({
          cwd,
          search: searchQuery || undefined,
          limit: searchQuery ? undefined : 50,
        });
        if (result.success && result.data) {
          log(
            "fetchBranches: count=%d current=%s",
            result.data.branches.length,
            result.data.current,
          );
          setBranches(result.data.branches);
          setCurrentBranch(result.data.current);
          setDetachedHead(result.data.detachedHead);
          setIsGitRepo(true);
        } else {
          log("fetchBranches: error %s", result.error);
          setIsGitRepo(false);
          setError(result.error ?? t("branch.loadFailed"));
        }
      } catch (err) {
        setIsGitRepo(false);
        setError(err instanceof Error ? err.message : t("branch.loadFailed"));
      } finally {
        setLoading(false);
      }
    },
    [cwd],
  );

  // Fetch on popover open
  useEffect(() => {
    if (open) {
      fetchBranches();
      setSearch("");
      setHighlightIndex(0);
    }
  }, [open, fetchBranches]);

  // Initial check to determine if this is a git repo
  useEffect(() => {
    client.git
      .branches({ cwd, limit: 1 })
      .then((result) => {
        if (result.success && result.data) {
          log("initialCheck: cwd=%s current=%s", cwd, result.data.current);
          setCurrentBranch(result.data.current);
          setDetachedHead(result.data.detachedHead);
          setIsGitRepo(true);
        } else {
          log("initialCheck: not a git repo cwd=%s", cwd);
          setIsGitRepo(false);
        }
      })
      .catch(() => setIsGitRepo(false));
  }, [cwd]);

  // Debounced search
  const handleSearchChange = useCallback(
    (value: string) => {
      setSearch(value);
      setHighlightIndex(0);
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = setTimeout(() => {
        fetchBranches(value);
      }, 200);
    },
    [fetchBranches],
  );

  // Cleanup timeout
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleCheckout = useCallback(
    async (branch: string) => {
      if (branch === currentBranch) return;
      log("checkout: branch=%s", branch);
      setCheckingOut(true);
      setError(null);
      try {
        const result = await client.git.checkoutBranch({ cwd, branch });
        if (result.success) {
          setCurrentBranch(branch);
          setDetachedHead(undefined);
          setOpen(false);
          window.dispatchEvent(new CustomEvent("neovate:branch-changed"));
          if (result.data?.stashPopFailed) {
            setError(t("branch.stashPopFailed"));
          }
        } else {
          setError(result.error ?? t("branch.switchFailed"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t("branch.switchFailed"));
      } finally {
        setCheckingOut(false);
      }
    },
    [cwd, currentBranch],
  );

  const handleCreated = useCallback((name: string) => {
    log("branchCreated: name=%s", name);
    setCurrentBranch(name);
    setDetachedHead(undefined);
  }, []);

  // Split branches into recent and all
  const recentBranches = branches
    .filter((b) => b.lastCommitTimestamp != null)
    .sort((a, b) => (b.lastCommitTimestamp ?? 0) - (a.lastCommitTimestamp ?? 0));
  const allBranches = branches
    .filter((b) => b.lastCommitTimestamp == null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const flatList = [...recentBranches, ...allBranches];

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, flatList.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const branch = flatList[highlightIndex];
        if (branch) handleCheckout(branch.name);
      }
    },
    [flatList, highlightIndex, handleCheckout],
  );

  // Scroll highlighted item into view
  useEffect(() => {
    const item = listRef.current?.querySelector(`[data-index="${highlightIndex}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  if (!isGitRepo) return null;

  const displayName = currentBranch ?? (detachedHead ? `HEAD (${detachedHead})` : "unknown");

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          disabled={disabled || checkingOut}
          className="inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none cursor-pointer hover:text-foreground disabled:opacity-50 hover:!bg-background/80"
        >
          {checkingOut ? <Spinner className="h-3 w-3" /> : <GitBranch className="h-3 w-3" />}
          <span className="max-w-[200px] truncate">{displayName}</span>
          <ChevronDown className="h-3 w-3 opacity-50" />
        </PopoverTrigger>
        <PopoverPopup side="top" align="start" className="w-72">
          <div onKeyDown={handleKeyDown}>
            <div className="px-2 pb-2">
              <input
                ref={searchInputRef}
                type="text"
                className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs outline-none placeholder:text-muted-foreground/70 focus:ring-2 focus:ring-ring"
                placeholder={t("branch.searchPlaceholder")}
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                autoFocus
              />
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-4">
                <Spinner className="h-4 w-4" />
              </div>
            ) : error && branches.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                <p>{error}</p>
                <button
                  className="mt-1 text-xs text-primary hover:underline"
                  onClick={() => fetchBranches(search || undefined)}
                >
                  {t("branch.retry")}
                </button>
              </div>
            ) : flatList.length === 0 ? (
              <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                {t("branch.noBranches")}
              </div>
            ) : (
              <div ref={listRef} className="max-h-60 overflow-y-auto">
                {recentBranches.length > 0 && !search && (
                  <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                    {t("branch.recent")}
                  </div>
                )}
                {recentBranches.map((branch, i) => (
                  <BranchItem
                    key={branch.name}
                    branch={branch}
                    isCurrent={branch.name === currentBranch}
                    highlighted={highlightIndex === i}
                    dataIndex={i}
                    onClick={() => handleCheckout(branch.name)}
                  />
                ))}
                {recentBranches.length > 0 && allBranches.length > 0 && !search && (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <div className="px-2 pb-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground/60">
                      {t("branch.allBranches")}
                    </div>
                  </>
                )}
                {allBranches.map((branch, i) => (
                  <BranchItem
                    key={branch.name}
                    branch={branch}
                    isCurrent={branch.name === currentBranch}
                    highlighted={highlightIndex === recentBranches.length + i}
                    dataIndex={recentBranches.length + i}
                    onClick={() => handleCheckout(branch.name)}
                  />
                ))}
              </div>
            )}

            <div className="mt-1 border-t border-border pt-1">
              <button
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
              >
                <Plus className="h-3 w-3" />
                {t("branch.createNew")}
              </button>
            </div>
          </div>
        </PopoverPopup>
      </Popover>

      {/* Stash pop failure warning */}
      {error && !open && (
        <div className="mx-4 mb-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          {error}
        </div>
      )}

      <CreateBranchDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        cwd={cwd}
        currentBranch={currentBranch}
        onCreated={handleCreated}
      />
    </>
  );
}

function BranchItem({
  branch,
  isCurrent,
  highlighted,
  dataIndex,
  onClick,
}: {
  branch: GitBranchType;
  isCurrent: boolean;
  highlighted: boolean;
  dataIndex: number;
  onClick: () => void;
}) {
  return (
    <button
      data-index={dataIndex}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
        highlighted ? "bg-accent text-foreground" : "text-foreground hover:bg-accent"
      }`}
      onClick={onClick}
    >
      <span className="w-3.5 shrink-0">{isCurrent && <Check className="h-3 w-3" />}</span>
      <span className="min-w-0 flex-1 truncate text-left">{branch.name}</span>
      {(branch.ahead != null && branch.ahead > 0) ||
      (branch.behind != null && branch.behind > 0) ? (
        <span className="shrink-0 text-[10px] text-muted-foreground/60">
          {branch.ahead ? `↑${branch.ahead}` : ""}
          {branch.ahead && branch.behind ? " " : ""}
          {branch.behind ? `↓${branch.behind}` : ""}
        </span>
      ) : null}
    </button>
  );
}
