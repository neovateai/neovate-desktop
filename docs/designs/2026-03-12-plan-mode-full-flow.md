# Plan Mode Full Flow Design

**Date:** 2026-03-12
**Status:** Proposed (v4)

## Overview

Implement the full Plan Mode flow for ExitPlanMode, including plan approval dialog via `canUseTool` interception, permission mode switching, context clearing, and plan file persistence.

Currently, `EnterPlanMode` and `ExitPlanMode` exist as basic tool-part renderers. This design adds the interactive approval flow that matches the Claude Code CLI experience.

## Architecture

Follows the same `canUseTool` interception pattern as the AskUserQuestion MVP (see `2026-03-11-ask-user-question-via-can-use-tool-mvp-design.md`):

```
Claude calls ExitPlanMode({ plan: "..." })
  |
SDK calls canUseTool("ExitPlanMode", { plan }, options)
  |
session-manager.ts publishes permission_request event
  |
PermissionDialog detects toolName === "ExitPlanMode"
  |
  +-- ExitPlanMode.inputSchema.safeParse(request.input)
  |     |
  |     +-- parse fails → fall through to regular PermissionRequestDialog
  |     |
  |     +-- parse succeeds, input.plan is empty/falsy → auto-allow (no dialog)
  |     |
  |     +-- parse succeeds, input.plan present → Renders ExitPlanModeRequestDialog
  |           |
  |           User picks option (approve with mode / revise / dismiss)
  |           |
  |           Returns PlanApprovalChoice to PermissionDialog orchestrator
```

### Input validation

Like AskUserQuestion, the input is validated with `ExitPlanMode.inputSchema.safeParse(request.input)` before rendering the approval dialog. If validation fails, the request falls through to the generic `PermissionRequestDialog`.

No main-process protocol changes needed. Everything reuses the existing `canUseTool` -> `permission_request` -> `respondToRequest` flow.

### Empty plan handling

If `input.plan` is falsy or whitespace-only, auto-allow without showing the approval dialog. This matches the CLI behavior where an empty plan produces a simple "Exited plan mode" message.

## ExitPlanMode Approval Dialog

### UI Layout

Uses the existing `Plan` component (`components/ai-elements/plan.tsx`) for the plan content display, which provides collapsible card styling with `PlanHeader`, `PlanContent`, `PlanTrigger`.

### Dialog sizing

The approval dialog renders inline (same position as permission dialogs — grid-overlaying the message input in `agent-chat.tsx`). Since the plan content can be large, the plan area is constrained with `max-h-[60vh] overflow-y-auto`. The collapsible `Plan` component allows the user to collapse the plan content to focus on the approval options.

```
+---------------------------------------------+
| [Plan component - collapsible]               |
|  Plan to implement                     [v]   |
| ------------------------------------------- |
|  [rendered markdown plan content]            |
|  (scrollable, max-height constrained)        |
+---------------------------------------------+
|                                              |
|  Ready to implement?                         |
|                                              |
|  o Yes, bypass permissions (YOLO)            |
|  o Yes, auto-approve edits                   |
|  * Yes, manually approve edits               |
|  o Yes, clear context & bypass permissions   |
|  o Request revision...                       |
|    +----------------------------------------+|
|    | [textarea - feedback for Claude]        ||
|    +----------------------------------------+|
|                                              |
|                              [Submit ->]     |
+---------------------------------------------+
```

### Unified submit flow

All options (approve and reject) share a single submit button. The button label and behavior change based on selection:

- **Approve options (1-4):** Button says "Approve" → returns `approve` choice
- **Request revision:** Button says "Request Revision" → returns `revise` choice with feedback

The feedback textarea only appears when "Request revision" is selected.

A secondary "Dismiss" text button is always visible. This sends a `dismiss` choice — distinct from "Request revision" (dismiss = user doesn't want to engage, revise = user wants Claude to improve the plan).

### Default selection

"Yes, manually approve edits" (`default` mode) is pre-selected. This is the safest default — the user can submit immediately without changing anything. Opting into YOLO requires an explicit choice.

### Approval Options

| Option                           | Permission Mode     | Clear Context |
| -------------------------------- | ------------------- | ------------- |
| Bypass permissions (YOLO)        | `bypassPermissions` | No            |
| Auto-approve edits               | `acceptEdits`       | No            |
| Manually approve edits (default) | `default`           | No            |
| Clear context & bypass           | `bypassPermissions` | Yes           |
| Request revision                 | n/a                 | No            |

### Component responsibility split

The `ExitPlanModeRequestDialog` is a **pure UI component**. It does NOT call `respondToRequest` or `dispatch`. It returns a structured choice:

```ts
type PlanApprovalChoice =
  | { action: "approve"; mode: PermissionMode; clearContext: boolean }
  | { action: "revise"; feedback: string }
  | { action: "dismiss" };
```

All orchestration (respond → store update → dispatch → context clear) lives in `permission-dialog.tsx`, which has access to `sessionId`, the chat instance, and the agent store.

### Response Mapping

#### Approve (no clear context)

```ts
// permission-dialog.tsx — handleExitPlanModeChoice()
const handleExitPlanModeChoice = async (choice: PlanApprovalChoice) => {
  if (choice.action === "revise") {
    // See "Request revision" below
    return;
  }

  // 1. Return allow — SDK runs ExitPlanMode.call() which restores prePlanMode
  await respondToRequest(requestId, {
    type: "permission_request",
    result: { behavior: "allow", updatedInput: { ...input } },
  });

  // 2. Update agent store (for UI: dropdown, plan mode pill)
  setPermissionMode(sessionId, choice.mode);

  // 3. Override SDK's prePlanMode restoration with user's chosen mode
  // Must happen AFTER respondToRequest completes — see ordering rationale below
  chat.dispatch({
    kind: "configure",
    configure: { type: "set_permission_mode", mode: choice.mode },
  });

  // 4. Save plan to disk (all approvals, not just context clearing)
  client.agent.savePlan({ sessionId, plan: input.plan });

  // 5. If clear context requested, register pending action
  if (choice.clearContext) {
    const cwd = useAgentStore.getState().sessions.get(sessionId)?.cwd;
    // CWD must be captured BEFORE the session is closed
    chat.store.setState({
      pendingContextClear: { plan: input.plan, mode: choice.mode, cwd },
    });
  }
};
```

**Ordering rationale:** The SDK's ExitPlanMode.call() internally restores `prePlanMode` (the mode active before entering plan mode). Our `set_permission_mode` dispatch must arrive AFTER this to override it with the user's selection. Since `respondToRequest` sends IPC first and the SDK processes it synchronously, dispatching immediately after the await is safe — the SDK will have already finished the ExitPlanMode tool execution.

**Dual update rationale:** Both `setPermissionMode(sessionId, mode)` (Zustand store for UI) and `chat.dispatch(set_permission_mode)` (SDK backend) are required. The store update is synchronous and immediate; the dispatch is async IPC. This matches the existing pattern in `input-toolbar.tsx:127-135`.

#### Approve (with clear context)

Same as above, plus the `pendingContextClear` flag is set on the chat store. Context clearing executes when the turn completes (see Context Clearing Flow below).

#### Request revision (reject with feedback)

```ts
if (choice.action === "revise") {
  await respondToRequest(requestId, {
    type: "permission_request",
    result: {
      behavior: "deny",
      message: choice.feedback || "User requested plan revision",
    },
  });
  // Claude receives rejection and revises the plan. No mode change needed.
}
```

#### Dismiss

```ts
if (choice.action === "dismiss") {
  await respondToRequest(requestId, {
    type: "permission_request",
    result: {
      behavior: "deny",
      message: "User dismissed plan approval",
    },
  });
}
```

## Context Clearing Flow

Context clearing uses a deterministic store-subscription pattern, piggybacking on the existing `onTurnComplete` infrastructure in `ClaudeCodeChat`.

### Mechanism: pendingContextClear in chat store state

Add `pendingContextClear` to `ClaudeCodeChatStoreState`:

```ts
// chat-state.ts
export interface ClaudeCodeChatStoreState {
  // ... existing fields ...
  pendingContextClear?: {
    plan: string;
    mode: PermissionMode;
    cwd?: string; // captured BEFORE session close
  };
}
```

The existing `onTurnComplete` callback in `ClaudeCodeChatManager` checks for the flag:

```ts
// chat-manager.ts — #turnCallbacks
#turnCallbacks = {
  onTurnComplete: async (id: string, result: "success" | "error") => {
    const chat = this.chats.get(id);
    const pending = chat?.store.getState().pendingContextClear;

    if (pending) {
      chat.store.setState({ pendingContextClear: undefined });
      const cwd = pending.cwd;
      if (!cwd) return;

      // 1. Close the old session
      await this.removeSession(id);
      useAgentStore.getState().removeSession(id);

      // 2. Create new session
      const { sessionId, commands, models, ...rest } =
        await this.createSession(cwd);

      // 3. Register in store and set permission mode
      registerSessionInStore(sessionId, cwd, { commands, models, ...rest }, true);
      useAgentStore.getState().setPermissionMode(sessionId, pending.mode);
      this.getChat(sessionId)?.dispatch({
        kind: "configure",
        configure: { type: "set_permission_mode", mode: pending.mode },
      });

      // 4. Auto-send the plan as the first message
      useAgentStore.getState().addUserMessage(sessionId, pending.plan);
      this.getChat(sessionId)?.sendMessage({
        text: `Implement the following plan:\n\n${pending.plan}`,
        metadata: { sessionId, parentToolUseId: null },
      });
    }

    // Existing background-session notification logic
    const { activeSessionId, markTurnCompleted } = useAgentStore.getState();
    if (activeSessionId !== id) markTurnCompleted(id, result);
  },
  onTurnStart: (id: string) => {
    useAgentStore.getState().clearTurnResult(id);
  },
};
```

This is deterministic — the context clear triggers exactly when the turn finishes, via the existing store subscription. No new parallel state mechanism, no timing guesses.

### CWD capture

The CWD must be read from the agent store **before** the session is closed, since closing removes the store entry. This is done in the approval handler (permission-dialog.tsx) and stored in `pendingContextClear.cwd`.

### Error/cleanup paths

If the turn ends with `result === "error"`, the context clear still fires. The plan was approved — the error is unrelated (likely the ExitPlanMode tool had an issue). The user still wants to proceed with the plan.

### Error recovery

If `createSession` fails after `removeSession`, the conversation is lost but the plan is safe (saved via `savePlan` before context clearing triggers). On error:

- Catch the exception in `onTurnComplete`
- Create a fresh session without injecting the plan
- Show an error notification with the saved plan file path so the user can manually reference it

## Plan File Persistence

Plans saved to `~/.neovate-desktop/plans/` on **every approval** (not just context clearing). This gives users a history of all approved plans.

Format: `<date>-<slug>.md`

Add a `savePlan` RPC endpoint on the agent router:

```ts
savePlan: os.input(
  z.object({
    sessionId: z.string(),
    plan: z.string(),
    title: z.string().optional(),
  }),
).handler(async ({ input }) => {
  const slug = input.title
    ? input.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .slice(0, 50)
    : input.sessionId.slice(0, 8);
  const filename = `${new Date().toISOString().slice(0, 10)}-${slug}.md`;
  const dir = path.join(homedir(), ".neovate-desktop", "plans");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, filename), input.plan, "utf8");
  return { path: path.join(dir, filename) };
});
```

## Updated ExitPlanMode Tool Renderer

### No duplicate plan display

While the approval dialog is showing, the tool-part card in the message stream must NOT also show the plan. This follows the same pattern as `AskUserQuestionTool`:

```tsx
// exit-plan-mode-tool.tsx
if (
  !invocation ||
  invocation.state === "input-streaming" ||
  invocation.state === "input-available" ||
  !invocation.output
) {
  return null; // hidden while approval dialog is active
}
```

The tool-part only renders after the tool completes (with output). This prevents the user from seeing the plan twice (once in the message stream, once in the dialog).

### Post-completion display

After approval, the tool-part renderer shows a compact outcome:

- **Approved:** "Plan approved — implementing with {mode} mode" (collapsed plan content below)
- **Rejected:** "Plan revision requested" (no plan content — Claude is revising)

Does NOT duplicate the full plan that the approval dialog already showed. Uses a concise status line.

## Context Clearing Loading State

Between approving "clear context" and the new session being ready, the user sees a brief gap (old session closing, new one creating). To avoid a blank/confusing screen, show a transient loading indicator.

The `pendingContextClear` flag in the chat store doubles as the loading signal. In `agent-chat.tsx`, when `pendingContextClear` is set on the current chat, render a "Setting up new session..." overlay or inline message instead of the normal chat content. This state is naturally cleared when the old session is removed and the new session becomes active.

## Implementation Files

| #   | File                                | Action | Description                                                                         |
| --- | ----------------------------------- | ------ | ----------------------------------------------------------------------------------- |
| 1   | `exit-plan-mode-request-dialog.tsx` | Create | Pure UI dialog returning `PlanApprovalChoice`                                       |
| 2   | `permission-dialog.tsx`             | Edit   | Add ExitPlanMode branch, empty plan auto-allow, multi-step resolution orchestration |
| 3   | `exit-plan-mode-tool.tsx`           | Edit   | Hide while pending + show compact approval outcome                                  |
| 4   | `agent/router.ts` (main)            | Edit   | Add `savePlan` endpoint                                                             |
| 5   | `chat-state.ts`                     | Edit   | Add `pendingContextClear` to store state                                            |
| 6   | `chat-manager.ts`                   | Edit   | Handle `pendingContextClear` in `onTurnComplete` + error recovery                   |

## Constraints

### 1. Follow existing canUseTool semantics

Same as AskUserQuestion MVP — `PermissionResult` only supports `allow + updatedInput` or `deny + message`. All client-side effects (mode switching, session management) happen after the resolve call.

### 2. No new request type

Continue using `permission_request` with tool-name branching. No new protocol types.

### 3. Plan content comes from input

The plan text arrives as `input.plan` from the SDK. We render it as markdown. We do not read plan files from disk (the SDK handles that internally).

### 4. Permission mode: dual update required

Both updates must happen on approve:

- `setPermissionMode(sessionId, mode)` — Zustand store for UI (dropdown, plan mode pill)
- `chat.dispatch({ kind: "configure", configure: { type: "set_permission_mode", mode } })` — SDK backend

This matches the existing pattern in `input-toolbar.tsx:127-135`.

### 5. Permission mode dispatch ordering

The SDK dispatch MUST happen after `respondToRequest` completes (awaited). The SDK's ExitPlanMode.call() restores `prePlanMode` during tool execution. Our dispatch overrides this with the user's selection. The ordering is guaranteed because the SDK processes the `allow` result synchronously before our dispatch arrives via IPC.

### 6. Dialog is pure UI

`ExitPlanModeRequestDialog` returns a `PlanApprovalChoice` — it has no knowledge of `sessionId`, `respondToRequest`, `dispatch`, or the agent store. All orchestration lives in `permission-dialog.tsx`.

## Risks

### 1. Context clearing: onTurnComplete reliability

The `pendingContextClear` flag fires via `onTurnComplete` (store subscription for `streaming → ready|error`). If the stream is interrupted before transitioning, the pending flag stays orphaned. Mitigation: also clear the flag on session removal or explicit interrupt.

### 2. SDK permission mode race

Although the ordering argument (constraint 5) is sound, edge cases like slow IPC or SDK async internals could cause our dispatch to arrive before ExitPlanMode finishes. Mitigation: if issues arise, add a small safety delay (50-100ms) before the dispatch.

### 3. Plan size

Large plans may make the approval dialog unwieldy. The Plan component's collapsible content and `max-h-[60vh] overflow-y-auto` keep it manageable.

### 4. Session switch during pending dialog

If the user switches to another session while the ExitPlanMode dialog is showing, the dialog disappears (it's per-session `pendingRequests`). When they switch back, it reappears. No special handling needed — this is the existing behavior for all permission requests.
