import type {
  IDisposable,
  ILinkProvider,
  ILink,
  IBufferCellPosition,
  Terminal as XTermTerminal,
  ITheme,
} from "@xterm/xterm";

// File path patterns for detecting file links in terminal output
// All patterns include optional line:column suffix (e.g., file.ts:10:5)
const FILE_PATH_PATTERNS = [
  // Match relative paths: ./file.ts, ../file.ts
  /\.{1,2}\/[\w./-]+\.\w+(?::\d+(?::\d+)?)?/,
  // Match common source directory paths: src/components/button.tsx
  /(?:src|app|lib|utils|components|pages|api|test|tests|spec|examples|docs|types|hooks)\/[\w./-]+\.\w+(?::\d+(?::\d+)?)?/i,
  // Match absolute paths: /Users/name/file.ts, /home/user/file.ts
  /(?:\/Users\/[^/]+|\/home\/[^/]+|\/var\/log|\/tmp|\/opt|\/etc)\/[\w./-]+\.\w+(?::\d+(?::\d+)?)?/,
];

/**
 * File Links Addon - Custom addon for detecting and handling file path links in terminal
 * Supports formats like:
 * - ./src/store.ts
 * - ../components/button.tsx:42
 * - src/utils/helper.ts:10:5 (line:column)
 * - /absolute/path/to/file.ts
 */
export class FileLinksAddon implements IDisposable {
  private _disposables: IDisposable[] = [];
  private _handler: (event: MouseEvent, uri: string) => void;
  private _tooltipElement: HTMLElement | undefined;
  private _theme: ITheme | undefined;

  constructor(handler: (event: MouseEvent, uri: string) => void, theme?: ITheme) {
    this._handler = handler;
    this._theme = theme;
  }

  activate(terminal: XTermTerminal): void {
    // Create tooltip element with theme colors
    this._tooltipElement = document.createElement("div");
    this._tooltipElement.className = "file-links-tooltip";

    // Use theme colors if available, otherwise use defaults
    const bgColor = this._theme?.background ?? "#1a1a1a";
    const fgColor = this._theme?.foreground ?? "#e0e0e0";

    this._tooltipElement.style.cssText = `
      position: fixed;
      display: none;
      padding: 4px 8px;
      background: ${bgColor};
      color: ${fgColor};
      font-size: 12px;
      border-radius: 4px;
      pointer-events: none;
      z-index: 1000;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(128, 128, 128, 0.3);
    `;
    document.body.appendChild(this._tooltipElement);

    // Register a link provider that detects file paths
    const linkProvider: ILinkProvider = {
      provideLinks: (y: number, callback: (links: ILink[] | undefined) => void): void => {
        const links = this._findFileLinks(terminal, y);
        callback(links);
      },
    };

    const disposable = terminal.registerLinkProvider(linkProvider);
    this._disposables.push(disposable);

    // Add dispose callback to remove tooltip
    const tooltipDisposable = {
      dispose: () => {
        if (this._tooltipElement?.parentNode) {
          this._tooltipElement.parentNode.removeChild(this._tooltipElement);
        }
        this._tooltipElement = undefined;
      },
    };
    this._disposables.push(tooltipDisposable);
  }

  dispose(): void {
    this._disposables.forEach((d) => d.dispose());
    this._disposables = [];
  }

  /**
   * Show tooltip at the given position
   */
  private _showTooltip(event: MouseEvent, _text: string): void {
    if (!this._tooltipElement) return;

    const modifierKey = this._getModifierKey();
    this._tooltipElement.textContent = `${modifierKey} + 点击打开文件`;
    this._tooltipElement.style.display = "block";
    this._updateTooltipPosition(event);
  }

  /**
   * Hide tooltip
   */
  private _hideTooltip(): void {
    if (!this._tooltipElement) return;
    this._tooltipElement.style.display = "none";
  }

  /**
   * Update tooltip position
   */
  private _updateTooltipPosition(event: MouseEvent): void {
    if (!this._tooltipElement) return;

    const x = event.clientX;
    const y = event.clientY - 30; // Show above the cursor

    this._tooltipElement.style.left = `${x}px`;
    this._tooltipElement.style.top = `${y}px`;
  }

  /**
   * Get the modifier key name based on platform
   */
  private _getModifierKey(): string {
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
    return isMac ? "Cmd" : "Ctrl";
  }

  /**
   * Find file path links in the given line
   * Line numbers are 1-indexed in xterm.js
   */
  private _findFileLinks(terminal: XTermTerminal, y: number): ILink[] {
    const links: ILink[] = [];
    const buffer = terminal.buffer.active;
    const line = buffer.getLine(y - 1); // xterm.js uses 0-indexed buffer lines
    if (!line) return links;

    const lineText = line.translateToString(false);
    if (!lineText) return links;

    // Use global patterns with 'g' flag for iteration
    const patterns = FILE_PATH_PATTERNS.map((p) => new RegExp(p.source, p.flags + "g"));

    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = pattern.exec(lineText)) !== null) {
        let uri = match[0];
        const startIdx = match.index;
        let endIdx = startIdx + uri.length - 1; // end index is inclusive

        // Trim trailing spaces from the link
        const trailingSpaces = uri.match(/\s+$/);
        if (trailingSpaces) {
          uri = uri.slice(0, -trailingSpaces[0].length);
          endIdx -= trailingSpaces[0].length;
        }

        // Skip if uri is empty after trimming
        if (!uri) continue;

        // Check if this match is part of a URL (http:// or https://)
        // Look back from the match start to see if there's a URL scheme
        const beforeMatch = lineText.slice(0, startIdx);
        const urlSchemeMatch = beforeMatch.match(/(https?:\/\/)$/);
        if (urlSchemeMatch) {
          // This match is part of a URL, skip it
          continue;
        }

        // Validate it looks like a real file path
        if (!this._isValidFilePath(uri)) {
          continue;
        }

        // Convert to 1-indexed buffer positions
        const startPos = this._stringIndexToBufferPosition(line, startIdx, y);
        const endPos = this._stringIndexToBufferPosition(line, endIdx, y);

        if (startPos && endPos) {
          const addon = this;
          links.push({
            text: uri,
            range: {
              start: startPos,
              end: endPos,
            },
            activate: (event: MouseEvent, text: string) => {
              console.log("FileLinksAddon: clicked", { text });
              this._handler(event, text);
            },
            hover: (event: MouseEvent, text: string) => {
              addon._showTooltip(event, text);
            },
            leave: () => {
              addon._hideTooltip();
            },
          });
        }
      }
    }

    return links;
  }

  /**
   * Validate if the string looks like a real file path
   */
  private _isValidFilePath(uri: string): boolean {
    // Skip if it looks like a URL
    if (uri.startsWith("http://") || uri.startsWith("https://")) {
      return false;
    }

    // Remove line/column numbers for validation
    const pathWithoutLineNumbers = uri.split(":")[0];

    // Must have a file extension
    const extMatch = pathWithoutLineNumbers.match(/\.([^.]+)$/);
    if (!extMatch) return false;

    // Check if extension is valid
    if (!isValidFileExtension(extMatch[1])) {
      return false;
    }

    // Skip if contains // (likely a URL path)
    if (pathWithoutLineNumbers.includes("//")) {
      return false;
    }

    // Skip common false positives
    if (/\.{3,}/.test(uri) || /^\.{1,2}$/.test(uri)) {
      return false;
    }

    return true;
  }

  /**
   * Convert string index to buffer cell position
   * xterm.js uses 1-indexed coordinates for IBufferCellPosition
   */
  private _stringIndexToBufferPosition(
    line: any,
    stringIndex: number,
    lineY: number,
  ): IBufferCellPosition | null {
    // xterm.js buffer cells can be wider for some characters
    // We need to iterate through cells to find the correct position
    let currentIdx = 0;

    for (let i = 0; i < line.length; i++) {
      const cell = line.getCell(i);
      if (!cell) continue;

      const char = cell.getChars();
      const width = cell.getWidth();

      if (currentIdx === stringIndex) {
        return { x: i + 1, y: lineY }; // 1-indexed
      }

      // Skip wide characters (they take 2 columns)
      if (width === 2) {
        if (currentIdx + 1 === stringIndex) {
          return { x: i + 2, y: lineY }; // middle of wide char
        }
        currentIdx += 2;
      } else {
        currentIdx += char.length || 1;
      }
    }

    // If we're at the end
    if (currentIdx === stringIndex) {
      return { x: line.length + 1, y: lineY };
    }

    return null;
  }
}

/**
 * Check if an extension is a valid code/config file extension
 */
function isValidFileExtension(ext: string): boolean {
  const validCodeExtensions = new Set([
    // JavaScript/TypeScript
    "js",
    "mjs",
    "cjs",
    "ts",
    "mts",
    "cts",
    "tsx",
    "jsx",
    // Python
    "py",
    "pyi",
    "pyw",
    "pyc",
    // Java/Kotlin
    "java",
    "kt",
    "kts",
    // C/C++/C#/Go/Rust
    "c",
    "h",
    "cpp",
    "hpp",
    "cc",
    "hh",
    "cs",
    "go",
    "rs",
    // Ruby/PHP/Lua
    "rb",
    "erb",
    "php",
    "lua",
    // Shell/Config
    "sh",
    "bash",
    "zsh",
    "fish",
    "ps1",
    "json",
    "yaml",
    "yml",
    "toml",
    "ini",
    "conf",
    "config",
    // Web
    "html",
    "htm",
    "css",
    "scss",
    "sass",
    "less",
    // Documentation
    "md",
    "mdx",
    "rst",
    "txt",
    // Other code
    "swift",
    "scala",
    "clj",
    "cljs",
    "erl",
    "ex",
    "exs",
    "hs",
    "lhs",
    "ml",
    "mli",
    "fs",
    "fsx",
    // Build/Config files
    "dockerfile",
    "makefile",
    "cmake",
    "gradle",
  ]);

  return ext.length >= 2 && (validCodeExtensions.has(ext.toLowerCase()) || /^\d+$/.test(ext));
}

/**
 * Detect if a text is a file path and extract path and line number
 * Supports formats like:
 * - ./src/store.ts
 * - src/store.ts:42
 * - app/components/button.tsx:10:5 (line:column)
 */
export function detectFilePath(text: string): { path: string; line?: number } | null {
  // Skip URLs
  if (text.startsWith("http://") || text.startsWith("https://") || text.includes("//")) {
    return null;
  }

  // Parse line/column numbers
  const match = text.match(/^(.*?)(?::(\d+)(?::\d+)?)?$/);
  if (!match) return null;

  const [, pathPart, lineNum] = match;
  if (!pathPart) return null;

  const cleanPath = pathPart.replace(/:+$/, "");

  // Must have a file extension
  const extMatch = cleanPath.match(/\.([^.]+)$/);
  if (!extMatch || !isValidFileExtension(extMatch[1])) {
    return null;
  }

  // Check against file path patterns
  for (const pattern of FILE_PATH_PATTERNS) {
    if (pattern.test(cleanPath)) {
      return {
        path: cleanPath,
        line: lineNum ? parseInt(lineNum, 10) : undefined,
      };
    }
  }

  // Also allow absolute paths that don't match specific prefixes
  if (cleanPath.startsWith("/") && /\/[^/]+\.[^/]+$/.test(cleanPath)) {
    return {
      path: cleanPath,
      line: lineNum ? parseInt(lineNum, 10) : undefined,
    };
  }

  return null;
}
