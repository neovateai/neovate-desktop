# Debug View Improvements

## Summary

Restructure the debug view panel into grouped collapsible sections with a proper title, scrollable active sessions, and a dedicated prompt suggestion debug section.

## Structure

```
+-------------------------------+
| Debug View            [max][R]|  <- Panel header: title + maximize + refresh
+-------------------------------+
| > Active Sessions (2)         |  <- Collapsed by default
|                               |
+-------------------------------+
| v Prompt Suggestions          |  <- Expanded by default
|  +---------------------------+|
|  | Live State                ||
|  | * abc123 [ready] "run..." ||  <- * = active session
|  |   def456 [streaming] none ||
|  +---------------------------+|
|  | Simulate                  ||
|  | [short suggestion]    [>] ||
|  | [long suggestion]     [>] ||
|  | [clear]               [>] ||
|  +---------------------------+|
+-------------------------------+
| v Auxiliary LLM               |  <- Expanded by default
|  [isConfigured] [query] ...   |
|  (result output)              |
+-------------------------------+
```

## Changes

### 1. Panel Header

- Title changes from "Active Sessions" to "Debug View"
- Refresh button (refreshes sessions) and maximize button remain in the header
- Remove the simulate lightbulb button from header (moves to Prompt Suggestions section)

### 2. Collapsible Group Sections

A local `SectionGroup` component wrapping the existing `Collapsible`/`CollapsibleTrigger`/`CollapsiblePanel` from `components/ui/collapsible.tsx`.

- Header: `ChevronRight`/`ChevronDown` icon + uppercase label (`text-xs font-medium uppercase text-muted-foreground`)
- Animated open/close via `CollapsiblePanel`

Default open state:

- **Active Sessions**: collapsed
- **Prompt Suggestions**: expanded
- **Auxiliary LLM**: expanded

### 3. Active Sessions Section

- Header shows count badge: "Active Sessions (N)"
- Content area constrained: `max-h-60 overflow-y-auto` (scrollable)
- Session rows unchanged (expand for details, navigate on click, close button)
- Empty state: "No active sessions" message

### 4. Prompt Suggestions Section (new)

Two sub-areas:

**Live State**

- Iterates active sessions from `useAgentStore` session IDs
- For each, calls `claudeCodeChatManager.getChat(id)` and subscribes to `store.promptSuggestion` and `store.status`
- Each row displays:
  - Active session indicator (green dot or bold) if it's the currently active session
  - Short session ID
  - Chat status badge: `ready` / `streaming` / `submitted` (muted label, helps debug suggestion timing since suggestions auto-clear on turn start)
  - Current suggestion text (or "(none)")
- Updates in real-time as suggestions arrive/clear or status changes

**Simulate**

- Hardcoded test suggestions (short, long, `null` to clear)
- Each row: suggestion text preview + a button to set it on the active session's chat store
- Same mechanism as existing `handleSimulateSuggestion` but with multiple options
- Only works when there is an active session

### 5. Auxiliary LLM Section

- Existing `LlmTestSection` content, wrapped in a collapsible group
- No functional changes

## Data Access

Uses **Option B**: iterate session IDs from `useAgentStore` (already available), call `claudeCodeChatManager.getChat(id)` for each. No changes needed to `ClaudeCodeChatManager`.

## Files Modified

- `packages/desktop/src/renderer/src/plugins/debug/debug-view.tsx` — all changes in this single file
