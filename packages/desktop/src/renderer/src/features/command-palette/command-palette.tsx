import { SearchIcon, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { type ElementRef, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CommandItem as CommandItemType } from "./types";

import { cn } from "../../lib/utils";
import { useCommandPaletteStore } from "./store";
import { useCommandRegistry } from "./use-command-registry";

const PLACEHOLDERS = ["Search sessions and commands...", "Type > for commands..."];
const PLACEHOLDER_INTERVAL = 4000;

export function CommandPalette() {
  const isOpen = useCommandPaletteStore((s) => s.isOpen);
  const close = useCommandPaletteStore((s) => s.close);
  const recordSelect = useCommandPaletteStore((s) => s.recordSelect);
  const getFrecencyScore = useCommandPaletteStore((s) => s.getFrecencyScore);

  const { commands, sessionItems } = useCommandRegistry();

  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);

  const inputRef = useRef<ElementRef<"input">>(null);
  const listRef = useRef<ElementRef<"div">>(null);

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setHighlightIndex(0);
      setConfirmingId(null);
      setPlaceholderIndex(0);
      // Focus input after dialog renders
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [isOpen]);

  // Cycle placeholder text
  useEffect(() => {
    if (!isOpen) return;
    const timer = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, PLACEHOLDER_INTERVAL);
    return () => clearInterval(timer);
  }, [isOpen]);

  // Determine mode and filter
  const isCommandMode = query.startsWith(">");
  const searchQuery = isCommandMode
    ? query.slice(1).trim().toLowerCase()
    : query.trim().toLowerCase();

  const DESTRUCTIVE_IDS = useMemo(() => new Set(["archiveSession"]), []);

  const filteredItems = useMemo(() => {
    // Filter commands based on visibility predicates
    const visibleCommands = commands.filter((cmd) => !cmd.when || cmd.when());

    const matchItem = (item: CommandItemType) => {
      if (!searchQuery) return true;
      const haystack = [item.label, ...(item.keywords ?? [])].join(" ").toLowerCase();
      return searchQuery.split(/\s+/).every((word) => haystack.includes(word));
    };

    const MAX_SESSIONS = 10;

    let items: CommandItemType[];
    if (isCommandMode) {
      items = visibleCommands.filter(matchItem);
    } else {
      const matchedSessions = sessionItems.filter(matchItem).slice(0, MAX_SESSIONS);
      const matchedCommands = visibleCommands.filter(matchItem);
      items = [...matchedSessions, ...matchedCommands];
    }

    // Sort by frecency
    items.sort((a, b) => {
      // Keep sessions before commands in default mode
      if (!isCommandMode && a.group !== b.group) {
        return a.group === "session" ? -1 : 1;
      }
      return getFrecencyScore(b.id) - getFrecencyScore(a.id);
    });

    return items;
  }, [commands, sessionItems, searchQuery, isCommandMode, getFrecencyScore]);

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0);
  }, [filteredItems.length, searchQuery]);

  const executeItem = useCallback(
    (item: CommandItemType) => {
      // Destructive action guard
      if (DESTRUCTIVE_IDS.has(item.id) && confirmingId !== item.id) {
        setConfirmingId(item.id);
        return;
      }
      setConfirmingId(null);
      recordSelect(item.id);
      item.onSelect();
      close();
    },
    [confirmingId, close, recordSelect, DESTRUCTIVE_IDS],
  );

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": {
          e.preventDefault();
          setHighlightIndex((i) => (i + 1) % Math.max(filteredItems.length, 1));
          setConfirmingId(null);
          break;
        }
        case "ArrowUp": {
          e.preventDefault();
          setHighlightIndex(
            (i) => (i - 1 + Math.max(filteredItems.length, 1)) % Math.max(filteredItems.length, 1),
          );
          setConfirmingId(null);
          break;
        }
        case "Enter": {
          e.preventDefault();
          const item = filteredItems[highlightIndex];
          if (item) executeItem(item);
          break;
        }
        case "Escape": {
          e.preventDefault();
          if (confirmingId) {
            setConfirmingId(null);
          } else {
            close();
          }
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredItems, highlightIndex, close, executeItem, confirmingId]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (!listRef.current) return;
    const items = listRef.current.querySelectorAll("[data-palette-item]");
    items[highlightIndex]?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex]);

  if (!isOpen) return null;

  // Group items for rendering
  const sessionGroup = filteredItems.filter((i) => i.group === "session");
  const commandGroup = filteredItems.filter((i) => i.group === "command");

  // No-match fallback: create new chat
  const showNewChatFallback = !isCommandMode && searchQuery && sessionGroup.length === 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={close}
            transition={{ duration: 0.15 }}
          />

          {/* Palette */}
          <motion.div
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="fixed inset-x-0 top-[12vh] z-50 mx-auto w-full max-w-[540px] px-4"
            exit={{ opacity: 0, scale: 0.98, y: -4 }}
            initial={{ opacity: 0, scale: 0.98, y: -8 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <div className="overflow-hidden rounded-[0.625rem] border bg-popover shadow-lg">
              {/* Input */}
              <div className="flex items-center gap-2 border-b px-3">
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={PLACEHOLDERS[placeholderIndex]}
                  type="text"
                  value={query}
                />
              </div>

              {/* Results */}
              <div ref={listRef} className="max-h-[360px] overflow-x-hidden overflow-y-auto p-1.5">
                {filteredItems.length === 0 && !showNewChatFallback && (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    No results found.
                  </div>
                )}

                {/* Session group */}
                {sessionGroup.length > 0 && (
                  <PaletteGroup label={isCommandMode ? undefined : "Sessions"}>
                    {sessionGroup.map((item) => (
                      <PaletteItem
                        key={item.id}
                        confirmingId={confirmingId}
                        highlighted={filteredItems.indexOf(item) === highlightIndex}
                        item={item}
                        onMouseEnter={() => setHighlightIndex(filteredItems.indexOf(item))}
                        onSelect={() => executeItem(item)}
                      />
                    ))}
                  </PaletteGroup>
                )}

                {/* New chat fallback */}
                {showNewChatFallback && (
                  <PaletteGroup label="Sessions">
                    <div
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                        filteredItems.length === 0 && highlightIndex === 0 && "bg-accent",
                      )}
                      data-palette-item
                      onClick={() => {
                        // Just close — user can start new chat from main input
                        close();
                      }}
                    >
                      <Plus className="size-4 text-muted-foreground" />
                      <span>
                        New chat: <span className="text-muted-foreground">"{searchQuery}"</span>
                      </span>
                    </div>
                  </PaletteGroup>
                )}

                {/* Separator */}
                {sessionGroup.length > 0 && commandGroup.length > 0 && (
                  <div className="mx-2 my-1 h-px bg-border" />
                )}

                {/* Command group */}
                {commandGroup.length > 0 && (
                  <PaletteGroup label={isCommandMode ? "Commands" : "Actions"}>
                    {commandGroup.map((item) => (
                      <PaletteItem
                        key={item.id}
                        confirmingId={confirmingId}
                        highlighted={filteredItems.indexOf(item) === highlightIndex}
                        item={item}
                        onMouseEnter={() => setHighlightIndex(filteredItems.indexOf(item))}
                        onSelect={() => executeItem(item)}
                      />
                    ))}
                  </PaletteGroup>
                )}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">↑↓</kbd>
                    navigate
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">↵</kbd>
                    select
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">esc</kbd>
                    close
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PaletteGroup({ label, children }: { label?: string; children: React.ReactNode }) {
  return (
    <div>
      {label && <div className="px-2 py-1 text-xs font-medium text-muted-foreground">{label}</div>}
      {children}
    </div>
  );
}

function PaletteItem({
  item,
  highlighted,
  confirmingId,
  onSelect,
  onMouseEnter,
}: {
  item: CommandItemType;
  highlighted: boolean;
  confirmingId: string | null;
  onSelect: () => void;
  onMouseEnter: () => void;
}) {
  const isConfirming = confirmingId === item.id;
  const Icon = item.icon;
  const stateLabel = item.stateLabel?.();
  const shortcutDisplay = item.shortcut;

  return (
    <div
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
        highlighted && "bg-accent text-accent-foreground",
      )}
      data-palette-item
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}

      <div className="min-w-0 flex-1 truncate">
        {isConfirming ? (
          <span className="text-destructive">
            {item.label} "{item.label}"? Press Enter to confirm
          </span>
        ) : (
          <>
            <span className="truncate">{item.label}</span>
            {item.preview && (
              <span className="ml-2 truncate text-xs text-muted-foreground">{item.preview}</span>
            )}
          </>
        )}
      </div>

      {item.metadata && !isConfirming && (
        <span className="shrink-0 text-xs text-muted-foreground">{item.metadata}</span>
      )}

      {stateLabel && !isConfirming && (
        <span className="shrink-0 text-xs text-muted-foreground">({stateLabel})</span>
      )}

      {shortcutDisplay && !isConfirming && (
        <span className="ml-auto flex shrink-0 items-center gap-0.5">
          {shortcutDisplay.map((key, i) => (
            <kbd
              key={i}
              className="rounded border bg-muted px-1 font-mono text-[10px] text-muted-foreground"
            >
              {key}
            </kbd>
          ))}
        </span>
      )}
    </div>
  );
}
