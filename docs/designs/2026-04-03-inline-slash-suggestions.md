# Inline Slash Command Suggestions

## Behavior Summary

| Context       | Trigger                   | UX                                                          |
| ------------- | ------------------------- | ----------------------------------------------------------- |
| Start of line | `/`                       | **Current behavior** — dropdown popup with `SuggestionList` |
| Mid-line      | `/` + 1 char (e.g., `/s`) | **New** — inline ghost text, Tab to accept                  |

## How Inline Ghost Text Works

1. User types `hello /s` mid-line
2. A **ghost text decoration** `implify` appears after the cursor in muted/dimmed style (like IDE autocomplete)
3. The ghost text shows the **completion suffix** of the first alphabetically-matching command
4. As the user keeps typing (`/si` → ghost becomes `mplify`), the ghost updates or disappears if no match
5. **Tab** accepts: replaces `/simplify` text with a styled `slashCommand` pill node + trailing space
6. **Escape** or typing a non-matching character dismisses the ghost
7. If no commands match, no ghost text is shown

## Implementation Approach

**New ProseMirror plugin** — `InlineSlashPlugin` — separate from the existing `Suggestion`-based extension:

- Listens to editor transactions via `Plugin.view.update()`
- Detects a `/` that is **not** at position 1 of its text block (start-of-line is handled by the existing extension) **and** is preceded by whitespace or is at the start of a text node — avoids false triggers on file paths (`src/components`) and URLs (`https://example.com/search`)
- Extracts the query after `/`, filters commands (sorted alphabetically), takes the first prefix match
- Renders ghost text using a **ProseMirror Decoration** (`Decoration.widget`) — a `<span>` with muted styling appended after the cursor position
- Handles **Tab** keydown in the plugin's `handleKeyDown` to accept: deletes the `/query` range, inserts a `slashCommand` node + space
- **Plugin ordering**: `InlineSlashPlugin` is added **before** the `chatKeymap` plugin so its `handleKeyDown` runs first. When ghost text is active, it returns `true` for Tab to consume the event; otherwise it returns `false` and Tab falls through to the existing prompt-suggestion handler in `chatKeymap`
- The existing `startOfLine` Suggestion plugin remains completely untouched

## Key Details

- **Ghost text styling**: `opacity: 0.4`, same font, no background — matches the "quiet confidence" design principle
- **Match logic**: Filter commands where name starts with query (prefix match), sort alphabetically, show first. If query is empty (just `/`) or no prefix match, no ghost text
- **Dismissal**: Ghost disappears on Escape, when cursor moves away, when text no longer matches, or when the `/` is deleted
- **No conflict with existing extension**: The existing slash command extension has `startOfLine: true`, so it won't fire mid-line. The new plugin explicitly checks for non-start-of-line positions
- **Word boundary**: The `/` must be preceded by whitespace or be at text node start — prevents triggers on paths and URLs
- **Accept key**: Tab inserts the `slashCommand` pill node (same visual as current start-of-line behavior)
- **Tab priority**: `InlineSlashPlugin` handles Tab before `chatKeymap`. Ghost text active → consume Tab. No ghost text → fall through to prompt suggestion handler
- **Trigger threshold**: Ghost text only appears after 1+ characters typed after `/` (avoids noise for URLs)

## Files to Change

| File                          | Change                                                                                                                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `slash-commands-extension.ts` | Add `InlineSlashPlugin` as an additional ProseMirror plugin in `addProseMirrorPlugins()`                                                      |
| `message-input.tsx`           | Reorder plugin list so `slashCommandsExtension` is before `chatKeymap` (no logic changes needed — Tab priority is handled by plugin ordering) |
