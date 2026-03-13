# Permission Approve UX — Full Alignment with Claude Code

**Date:** 2026-03-12
**Status:** Implemented

## Problem

The current permission dialog (`permission-request-dialog.tsx`) is minimal:

- Two buttons: Allow / Deny
- Raw JSON dump of tool input
- No "always allow" option
- SDK provides `suggestions` (PermissionUpdate[]) in `options` but they are completely ignored
- No decision reason shown (why was the user prompted?)
- No feedback mechanism on deny
- No keyboard shortcuts

## Target

Align with Claude Code CLI's permission approval UX, which provides:

- Multiple approve options (Yes, Yes + always allow with smart labels)
- Decision reason display (mode, rule, hook, etc.)
- Smart suggestion-aware labels from SDK `PermissionUpdate[]`
- Deny with feedback ("tell Claude what to do differently")
- Keyboard shortcuts (y/a/n/Escape)
- Tool-specific input formatting

## Design

### Section 1: Data Flow

The backend (`session-manager.ts` canUseTool callback) already passes the full SDK options through to the frontend via the shared type `Omit<Parameters<CanUseTool>[2], "signal">`. This includes `suggestions`, `blockedPath`, `toolUseID`, `agentID`, and `description`. **No backend changes needed.**

When the user picks "Allow + always allow", the frontend constructs:

```ts
{
  behavior: "allow",
  updatedInput: input,
  updatedPermissions: options.suggestions, // pass SDK suggestions back
  toolUseID: options.toolUseID,
}
```

The SDK handles writing rules to the appropriate destination (session/project/user settings).

### Section 2: Permission Options

Computed dynamically from `request.options.suggestions`:

| Value           | Label                                                  | When shown                                                |
| --------------- | ------------------------------------------------------ | --------------------------------------------------------- |
| `"yes"`         | "Allow" (or "Allow once" when always-allow is visible) | Always                                                    |
| `"yes-always"`  | "Allow, and [smart label]"                             | When `suggestions` exist with `addRules`/`addDirectories` |
| `"no"`          | "Deny"                                                 | Always                                                    |
| `"no-feedback"` | "Deny, with feedback..."                               | Always (expands inline text input)                        |

> **Label disambiguation:** When the "yes-always" option is present, the plain "yes" option is labeled "Allow once" to make the distinction clear.

#### Smart Suggestion Labels

A pure function `formatSuggestionLabel(suggestions)` generates contextual text from `PermissionUpdate[]`:

- **addDirectories only**: "always allow access to **dirname/** in this project"
- **addRules (Read) only**: "allow reading from **dirname/** in this project"
- **addRules (Bash) only**: "don't ask again for **command** commands this session"
- **Mixed**: "allow **dirname/** access and **command** commands"
- **setMode**: shown with warning — "switch to **YOLO** mode for this session"
- **Fallback**: "always allow for this session"

The destination scope from `PermissionUpdate.destination` is surfaced in the label so the user knows how permanent the rule is:

- `session` -> "this session"
- `projectSettings` -> "in this project"
- `userSettings` -> "globally"
- `localSettings` -> "locally"

#### Persistence Subtitle

When the suggestion destination writes to disk, a small muted subtitle is shown under the "always allow" option so the user understands the side effect:

| Destination       | Subtitle                               | Persistence                            |
| ----------------- | -------------------------------------- | -------------------------------------- |
| `session`         | _(none)_                               | In-memory only, gone when session ends |
| `projectSettings` | "Saves to .claude/settings.json"       | Permanent, committed to git            |
| `localSettings`   | "Saves to .claude/settings.local.json" | Permanent, not committed to git        |
| `userSettings`    | "Saves to ~/.claude/settings.json"     | Permanent, global                      |

Example rendering:

```
○ Allow, always allow access to src/ in this project
  Saves to .claude/settings.json
```

#### Keyboard Shortcuts

| Key      | Action                                                                         |
| -------- | ------------------------------------------------------------------------------ |
| `y`      | Allow immediately (unless feedback input focused)                              |
| `a`      | Allow + always allow immediately (if available, unless feedback input focused) |
| `n`      | Deny immediately (unless feedback input focused)                               |
| `Escape` | Deny and dismiss (always works)                                                |

When feedback input is focused:
| `Enter` | Submit deny with feedback text |
| `Escape` | Collapse feedback input, return to option list |

#### Interaction Model

- **Click** on an option = immediate action (allow/deny/always-allow). No confirm button needed.
- **Click** on "Deny, with feedback..." = expand inline input (no immediate action)
- **Arrow keys** = navigate between options (visual focus, no action)
- **y/a/n** = immediate action (single-key shortcuts, disabled when input focused)
- **Escape** = deny and dismiss (always works)

Captured via `useEffect` keydown listener on `document`.

### Section 3: Decision Reason & Tool Preview

#### Decision Reason

A muted line above the options showing why the user was prompted:

```
> Default mode
```

- Infer from the current permission mode (read from config store): "Default mode", "Auto Edit mode", etc.
- If `options.blockedPath` exists, append it: "Default mode -- blocked access to /etc/passwd"

> **Note:** The SDK's `CanUseTool` options do NOT include a `description` field. That field exists only on the internal CLI type `SDKControlPermissionRequest`. Decision reason is inferred from the config store's permission mode + `blockedPath`.

#### Tool Input Preview

Replace raw JSON with tool-specific formatting:

| Tool                     | Display                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `Bash`                   | Command in code block (bash highlight). `input.description` as subtitle. |
| `Edit` / `Write`         | File path as title, truncated preview                                    |
| `Read`                   | File path                                                                |
| `Glob` / `Grep`          | Pattern + path                                                           |
| `WebFetch` / `WebSearch` | URL or query                                                             |
| **Fallback**             | Tool name + truncated JSON (capped ~4 lines)                             |

### Section 4: Component Structure & UI Layout

#### Visual Layout

```
+---------------------------------------------------+
|  Bash                            (1 of 3)          |  <- Tool icon + name + pending count
|  +-----------------------------------------------+ |
|  | $ npm run build                                | |  <- Tool-specific preview
|  +-----------------------------------------------+ |
|  > Default mode                                    |  <- Decision reason (muted)
|                                                     |
|  * Allow once                                 (y)  |  <- Click = immediate action
|  o Allow, always allow access to src/         (a)  |  <- Click = immediate action
|  o Deny                                       (n)  |  <- Click = immediate action
|  o Deny, with feedback...                           |  <- Click = expand input
|    +-----------------------------------------------+|
|    | tell Claude what to do differently...          ||  <- Enter submits, Esc cancels
|    +-----------------------------------------------+|
|                                                     |
|                                               Esc  |  <- Dismiss hint
+---------------------------------------------------+
```

> **Pending count:** Shown as "(1 of N)" next to the tool name when N > 1. Gives the user awareness of how many approvals remain. Uses `pendingRequests.length` which is already available in the store.

#### Component Tree

```
PermissionDialog (existing dispatcher -- minor: pass pendingCount prop)
  PermissionRequestDialog (rewritten)
    ToolPreview (new -- tool-specific input formatting)
    PendingCount (new -- "(1 of 3)" badge, hidden when count <= 1)
    DecisionReason (new -- small muted line)
    PermissionOptionList (new -- click-to-confirm option list)
      FeedbackInput (inline, shown when "deny with feedback" selected)
    Esc hint footer
```

#### Focus Management

- **On dialog appear**: Auto-focus the dialog container via `ref` + `useEffect` so keyboard shortcuts (`y`/`a`/`n`) work immediately without requiring a click first.
- **On dialog dismiss** (allow/deny resolved): Return focus to the message input editor. Use a callback or ref forwarded from `AgentChatSession`.
- **On feedback expand** (click "Deny, with feedback..."): Auto-focus the feedback `<input>` element.
- **On feedback collapse** (Escape in feedback input): Return focus to the dialog container so shortcuts resume working.
- **Between consecutive requests**: Focus stays on the dialog container. No focus jump.

#### Transition Between Consecutive Requests

When `key={requestId}` causes a remount on the next pending request:

- **Stable dimensions**: Apply `min-h-[<value>]` on the dialog container so the layout doesn't jump between requests with different content heights.
- **Crossfade**: Wrap the dialog in a CSS transition (`opacity` + `translate-y`) triggered on mount. Use Tailwind's `animate-in fade-in slide-in-from-bottom-2` utilities (already available via the app's animation setup).
- **No flicker**: The container element stays mounted (it's the parent `PermissionDialog` div). Only the inner content re-renders with the new request, so the yellow border frame remains stable.

### Section 5: Implementation Details

#### Files Changed/Created

| File                            | Action                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------- |
| `permission-request-dialog.tsx` | **Rewrite** -- new layout with sub-components inline, focus management, entry animation             |
| `permission-dialog.tsx`         | **Minor** -- pass `pendingCount` prop to `PermissionRequestDialog`                                  |
| `permission-utils.ts`           | **New** -- `formatSuggestionLabel()`, `formatToolPreview()`, `inferDecisionReason()` pure functions |
| `chat.ts`                       | **Minor** -- pass `updatedPermissions` in respondToRequest when behavior is "allow-always"          |
| `en-US.json` / `zh-CN.json`     | **Add** -- permission dialog strings                                                                |
| `types.ts` (shared)             | **No change**                                                                                       |
| `session-manager.ts`            | **No change**                                                                                       |

#### I18n Strings

```json
{
  "permission.title": "Permission requested",
  "permission.allow": "Allow",
  "permission.allowAlways": "Allow, and {{suggestion}}",
  "permission.deny": "Deny",
  "permission.denyFeedback": "Deny, with feedback...",
  "permission.feedbackPlaceholder": "Tell Claude what to do differently...",
  "permission.decisionReason.default": "Default mode",
  "permission.decisionReason.acceptEdits": "Auto Edit mode",
  "permission.decisionReason.plan": "Plan mode",
  "permission.escHint": "Esc to dismiss",
  "permission.allowOnce": "Allow once",
  "permission.decisionReason.blockedPath": "blocked access to {{path}}",
  "permission.scope.session": "this session",
  "permission.scope.projectSettings": "in this project",
  "permission.scope.userSettings": "globally",
  "permission.scope.localSettings": "locally",
  "permission.setModeWarning": "This will switch to {{mode}} mode for this session",
  "permission.pendingCount": "{{current}} of {{total}}",
  "permission.savesTo": "Saves to {{path}}"
}
```

Plus `zh-CN` equivalents.

#### Edge Cases

- **No suggestions**: "Allow + always" option hidden, only 3 options shown. "Allow" label used instead of "Allow once".
- **AskUserQuestion tool**: Still routed to `AskUserQuestionRequestDialog` (unchanged)
- **Multiple pending requests**: Queue behavior unchanged (first shown, rest wait). Pending count "(1 of N)" shown when N > 1.
- **Feedback on deny**: Enter submits deny with `message` set to feedback text
- **5-minute timeout**: Unchanged, backend auto-denies
- **Keyboard guard**: `y`/`a`/`n` shortcuts disabled when feedback `<input>` is focused. Escape still works (collapses input first, then dismisses dialog on second press).
- **blockedPath**: When present, appended to decision reason line for context
- **setMode suggestions**: Shown with warning text ("This will switch to YOLO mode for this session"). User sees the consequence before clicking.

#### Future Enhancements (v2)

- **Allow with feedback**: "Yes, and tell Claude what to do next" input mode on the allow side (Claude Code supports this but it's rarely used)
- **Destructive operation warning**: Show warning badge for tools with `destructive` MCP annotation (requires tool metadata lookup not currently in canUseTool options)
- **Editable command prefix**: For Bash, allow user to edit the command pattern for "don't ask again" rules (Claude Code supports `yes-prefix-edited`)

#### Styling

- Same yellow border treatment as current dialog
- Radio-style options using existing `RadioGroup` from `@base-ui/react`
- `Kbd` component for shortcut hints (y/a/n)
- Muted text (`text-muted-foreground`) for decision reason
- `CodeBlock` component for Bash command preview
- Feedback input: plain `<input>`, auto-focused when expanded

#### Accessibility

- RadioGroup provides built-in ARIA roles and arrow-key navigation
- Keyboard shortcuts have visible `Kbd` hints
- Focus is auto-managed: dialog receives focus on appear, returns to input on dismiss
- Focus is trapped within the dialog while visible
- Screen reader labels on all interactive elements
