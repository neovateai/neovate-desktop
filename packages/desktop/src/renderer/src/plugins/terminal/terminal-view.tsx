import type { ContractRouterClient } from "@orpc/contract";

import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import debug from "debug";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalContract } from "../../../../shared/plugins/terminal/contract";
import { usePluginContext } from "../../core/app";
import { useConfigStore } from "../../features/config/store";
import { useContentPanelViewContext } from "../../features/content-panel/components/view-context";
import { useProjectStore } from "../../features/project/store";

const log = debug("neovate:terminal");

type TerminalClient = ContractRouterClient<{ terminal: typeof terminalContract }>;

const darkTheme = {
  background: "#0a0a0a",
  foreground: "#e0e0e0",
  cursor: "#f0f0f0",
  cursorAccent: "#0a0a0a",
  selectionBackground: "rgba(255, 255, 255, 0.2)",
  black: "#1a1a1a",
  red: "#e06c75",
  green: "#98c379",
  yellow: "#e5c07b",
  blue: "#61afef",
  magenta: "#c678dd",
  cyan: "#56b6c2",
  white: "#abb2bf",
  brightBlack: "#5c6370",
  brightRed: "#e06c75",
  brightGreen: "#98c379",
  brightYellow: "#e5c07b",
  brightBlue: "#61afef",
  brightMagenta: "#c678dd",
  brightCyan: "#56b6c2",
  brightWhite: "#ffffff",
};

const lightTheme = {
  background: "#fafafa",
  foreground: "#383a42",
  cursor: "#526eff",
  cursorAccent: "#fafafa",
  selectionBackground: "rgba(0, 0, 0, 0.1)",
  black: "#383a42",
  red: "#e45649",
  green: "#50a14f",
  yellow: "#c18401",
  blue: "#0184bc",
  magenta: "#a626a4",
  cyan: "#0997b3",
  white: "#fafafa",
  brightBlack: "#4f525e",
  brightRed: "#e45649",
  brightGreen: "#50a14f",
  brightYellow: "#c18401",
  brightBlue: "#0184bc",
  brightMagenta: "#a626a4",
  brightCyan: "#0997b3",
  brightWhite: "#ffffff",
};

const DEFAULT_FONT_FAMILY = 'JetBrains Mono, Menlo, Monaco, "Courier New", monospace';
const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);

export default function TerminalView() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { orpcClient } = usePluginContext();
  const { resolvedTheme } = useTheme();

  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [searchVisible, setSearchVisible] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{
    resultIndex: number;
    resultCount: number;
  } | null>(null);

  const { isActive } = useContentPanelViewContext();

  const terminalFont = useConfigStore((s) => s.terminalFont);
  const terminalFontSize = useConfigStore((s) => s.terminalFontSize);

  useEffect(() => {
    if (!xtermRef.current) return;
    xtermRef.current.options.theme = resolvedTheme === "dark" ? darkTheme : lightTheme;
  }, [resolvedTheme]);

  useEffect(() => {
    if (!xtermRef.current || !fitAddonRef.current) return;
    xtermRef.current.options.fontSize = terminalFontSize;
    xtermRef.current.options.fontFamily = terminalFont
      ? `${terminalFont}, ${DEFAULT_FONT_FAMILY}`
      : DEFAULT_FONT_FAMILY;
    fitAddonRef.current.fit();
  }, [terminalFont, terminalFontSize]);

  useEffect(() => {
    if (isActive && fitAddonRef.current) {
      requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
      });
    }
  }, [isActive]);

  useEffect(() => {
    if (searchVisible) {
      searchInputRef.current?.focus();
    }
  }, [searchVisible]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const client = orpcClient as TerminalClient;
    const isDark = resolvedTheme === "dark";

    const { terminalFont: initFont, terminalFontSize: initFontSize } = useConfigStore.getState();

    const xterm = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      cursorStyle: "bar",
      lineHeight: 1.2,
      scrollback: 1000,
      fontFamily: initFont ? `${initFont}, ${DEFAULT_FONT_FAMILY}` : DEFAULT_FONT_FAMILY,
      fontSize: initFontSize,
      disableStdin: true,
      theme: isDark ? darkTheme : lightTheme,
    });
    xtermRef.current = xterm;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(
      new WebLinksAddon((event, uri) => {
        if (isMac ? event.metaKey : event.ctrlKey) {
          window.open(uri);
        }
      }),
    );
    xterm.open(container);
    fitAddon.fit();

    // Unicode 11 — correct CJK and emoji character widths
    const unicode11 = new Unicode11Addon();
    xterm.loadAddon(unicode11);
    xterm.unicode.activeVersion = "11";

    // Search addon
    const searchAddon = new SearchAddon();
    searchAddonRef.current = searchAddon;
    xterm.loadAddon(searchAddon);
    const resultsDisposable = searchAddon.onDidChangeResults((results) => {
      setSearchResults(results);
    });

    // WebGL renderer — falls back to canvas on context loss
    const webgl = new WebglAddon();
    webgl.onContextLoss(() => webgl.dispose());
    xterm.loadAddon(webgl);

    // Select-to-copy
    container.addEventListener("mouseup", () => {
      if (xterm.hasSelection()) {
        const text = xterm.getSelection();
        if (text) navigator.clipboard.writeText(text).catch(() => {});
      }
    });

    // Keyboard shortcuts
    xterm.attachCustomKeyEventHandler((event) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (event.type !== "keydown" || !modifier) return true;
      if (event.key === "k") {
        xterm.clear();
        return false;
      }
      if (event.key === "f") {
        setSearchVisible(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
        return false;
      }
      return true;
    });

    const abortController = new AbortController();
    let sessionId: string | null = null;
    let mounted = true;

    // Debounced resize observer
    let resizeTimer: ReturnType<typeof setTimeout> | undefined;
    const observer = new ResizeObserver(() => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        fitAddon.fit();
        const cols = xterm.cols;
        const rows = xterm.rows;
        if (cols >= 1 && rows >= 1 && sessionId) {
          client.terminal.resize({ sessionId, cols, rows });
        }
      }, 100);
    });
    observer.observe(container);

    async function setup() {
      const cols = Math.max(1, xterm.cols);
      const rows = Math.max(1, xterm.rows);

      const cwd = useProjectStore.getState().activeProject?.path;
      log("spawning terminal session", { cwd, cols, rows });
      const result = await client.terminal.spawn({ cwd, cols, rows });
      if (!mounted) {
        log("unmounted before session ready, killing", { sessionId: result.sessionId });
        client.terminal.kill({ sessionId: result.sessionId });
        return;
      }
      sessionId = result.sessionId;
      log("terminal session ready", { sessionId });

      xterm.options.disableStdin = false;
      const inputDisposable = xterm.onData((data) => {
        if (sessionId) client.terminal.write({ sessionId, data });
      });

      try {
        log("starting output stream", { sessionId });
        const stream = await (client as any).terminal.stream(
          { sessionId },
          { signal: abortController.signal },
        );
        for await (const chunk of stream) {
          xterm.write(chunk as string);
        }
        // Stream ended naturally (PTY exited)
        log("stream ended naturally", { sessionId });
        if (mounted) {
          xterm.write("\r\n\x1b[90mProcess exited.\x1b[0m\r\n");
          xterm.options.disableStdin = true;
          inputDisposable.dispose();
        }
      } catch {
        // AbortError on component unmount — normal cleanup, ignore
      }
    }

    setup();

    return () => {
      mounted = false;
      log("unmounting terminal, cleaning up", { sessionId });
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      abortController.abort();
      clearTimeout(resizeTimer);
      clearTimeout(searchTimerRef.current);
      resultsDisposable.dispose();
      observer.disconnect();
      if (sessionId) client.terminal.kill({ sessionId });
      xterm.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      if (value) {
        searchAddonRef.current?.findNext(value, { caseSensitive: false });
      } else {
        searchAddonRef.current?.clearDecorations();
        setSearchResults(null);
      }
    }, 50);
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      clearTimeout(searchTimerRef.current);
      setSearchVisible(false);
      setSearchQuery("");
      searchAddonRef.current?.clearDecorations();
      setSearchResults(null);
      xtermRef.current?.focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) {
        searchAddonRef.current?.findPrevious(searchQuery, { caseSensitive: false });
      } else {
        searchAddonRef.current?.findNext(searchQuery, { caseSensitive: false });
      }
    }
  };

  const searchLabel =
    searchResults === null
      ? null
      : searchResults.resultCount === 0
        ? "No results"
        : `${searchResults.resultIndex + 1} of ${searchResults.resultCount}`;

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div ref={containerRef} className="h-full w-full" />
      {searchVisible && (
        <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 rounded border border-border bg-background px-2 py-1 shadow-sm">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={handleSearchChange}
            onKeyDown={handleSearchKeyDown}
            className="w-40 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="Search..."
          />
          {searchLabel && (
            <span className="whitespace-nowrap text-xs text-muted-foreground">{searchLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
