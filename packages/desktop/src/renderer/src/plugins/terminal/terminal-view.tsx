import type { ContractRouterClient } from "@orpc/contract";

import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { useTheme } from "next-themes";
import { useEffect, useRef } from "react";
import "@xterm/xterm/css/xterm.css";
import { terminalContract } from "../../../../shared/plugins/terminal/contract";
import { usePluginContext } from "../../core/app";
import { useConfigStore } from "../../features/config/store";
import { useProjectStore } from "../../features/project/store";

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
    const container = containerRef.current;
    if (!container) return;

    const client = orpcClient as TerminalClient;
    const isDark = resolvedTheme === "dark";

    const { terminalFont: initFont, terminalFontSize: initFontSize } = useConfigStore.getState();

    const xterm = new Terminal({
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
    xterm.loadAddon(new WebLinksAddon());
    xterm.open(container);
    fitAddon.fit();

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

    // Cmd+K (Mac) / Ctrl+K (Win/Linux) — clear
    xterm.attachCustomKeyEventHandler((event) => {
      const modifier = isMac ? event.metaKey : event.ctrlKey;
      if (event.type === "keydown" && modifier && event.key === "k") {
        xterm.clear();
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
      const result = await client.terminal.spawn({ cwd, cols, rows });
      if (!mounted) {
        client.terminal.kill({ sessionId: result.sessionId });
        return;
      }
      sessionId = result.sessionId;

      xterm.options.disableStdin = false;
      const inputDisposable = xterm.onData((data) => {
        if (sessionId) client.terminal.write({ sessionId, data });
      });

      try {
        const stream = await (client as any).terminal.stream(
          { sessionId },
          { signal: abortController.signal },
        );
        for await (const chunk of stream) {
          xterm.write(chunk as string);
        }
        // Stream ended naturally (PTY exited)
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
      xtermRef.current = null;
      fitAddonRef.current = null;
      abortController.abort();
      clearTimeout(resizeTimer);
      observer.disconnect();
      if (sessionId) client.terminal.kill({ sessionId });
      xterm.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}
