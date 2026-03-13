# Terminal Font Config Fix

## Problem

`terminalFont` and `terminalFontSize` settings are saved to config store but never consumed by `terminal-view.tsx`. The terminal hardcodes `fontSize: 12` and a fixed `fontFamily` string.

## File

`packages/desktop/src/renderer/src/plugins/terminal/terminal-view.tsx`

## Design

Promote `fitAddon` to a ref (like `xtermRef` already is), then split concerns into independent effects:

1. **Extract `DEFAULT_FONT_FAMILY` constant** — shared between initial creation and font-change effect so they don't drift.

2. **Add `fitAddonRef`** — `useRef<FitAddon>(null)`, assigned during terminal creation effect.

3. **Lifecycle effect** (existing, modified):
   - Read initial `terminalFont` and `terminalFontSize` via `useConfigStore.getState()` inside the effect (not as hook selectors, to avoid adding deps).
   - Use them when constructing `new Terminal({ fontSize, fontFamily, ... })`.
   - Assign `fitAddonRef.current = fitAddon`.

4. **Theme effect** (existing, unchanged): updates `xterm.options.theme`.

5. **New font config effect**:

   ```ts
   const terminalFont = useConfigStore((s) => s.terminalFont);
   const terminalFontSize = useConfigStore((s) => s.terminalFontSize);

   useEffect(() => {
     if (!xtermRef.current || !fitAddonRef.current) return;
     xtermRef.current.options.fontSize = terminalFontSize;
     xtermRef.current.options.fontFamily = terminalFont
       ? `${terminalFont}, ${DEFAULT_FONT_FAMILY}`
       : DEFAULT_FONT_FAMILY;
     fitAddonRef.current.fit();
   }, [terminalFont, terminalFontSize]);
   ```

6. **Empty font fallback** — when `terminalFont` is `""`, fall back to `DEFAULT_FONT_FAMILY` (already handled in the effect above).

## Benefits

- Each concern is a single effect — theme, font, lifecycle are independent.
- Changes apply immediately to open terminals (xterm.js supports live option updates).
- `fitAddonRef` accessible everywhere, not buried in a closure.
- Consistent with existing theme effect pattern (lines 72-75).
