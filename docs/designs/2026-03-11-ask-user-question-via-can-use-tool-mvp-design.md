# AskUserQuestion via canUseTool MVP Design

**Date:** 2026-03-11
**Branch:** ask-user-question-tool-support
**Status:** Implemented

## Overview

Implement an MVP for `AskUserQuestion` without rendering it as a tool part in the message stream. Instead, `AskUserQuestion` will be intercepted by the Claude Agent SDK `canUseTool` callback, shown through the existing `pendingRequests` flow in the renderer, and returned to the SDK through `PermissionResult.updatedInput`.

The MVP goal is to establish the smallest viable end-to-end loop:

- the agent invokes `AskUserQuestion`
- the main process intercepts it in `canUseTool`
- the renderer shows a single interactive request
- the user submits answers
- the answers are returned through `updatedInput`
- the SDK continues execution

## Constraints

### 1. Follow the original `canUseTool` semantics

The SDK `CanUseTool` shape is:

```ts
type CanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: {
    signal: AbortSignal;
    suggestions?: PermissionUpdate[];
    blockedPath?: string;
    decisionReason?: string;
    toolUseID: string;
    agentID?: string;
  },
) => Promise<PermissionResult>;
```

`PermissionResult` only supports:

```ts
type PermissionResult =
  | {
      behavior: "allow";
      updatedInput?: Record<string, unknown>;
      updatedPermissions?: PermissionUpdate[];
      toolUseID?: string;
    }
  | {
      behavior: "deny";
      message: string;
      interrupt?: boolean;
      toolUseID?: string;
    };
```

This means:

- `AskUserQuestion` is still fundamentally a permission-gated tool execution on this path
- the MVP should not invent a second response protocol outside `PermissionResult`
- the renderer must ultimately return either `allow + updatedInput` or `deny`

### 2. No message-stream tool part

This MVP does not use `tool-AskUserQuestion` as an interactive card inside the message stream. It lives entirely in the `pendingRequests` UI flow. As a result:

- the request presentation is owned by request UI, not by message parts
- completion does not need to create a dedicated historical tool card in the chat transcript
- the design should stay as close as possible to the raw `canUseTool` model

## Decision

### Keep the request shape aligned with existing permission requests

The MVP does not introduce a new request protocol type. It continues to use the current shape:

```ts
type PermissionRequest = {
  type: "permission_request";
  toolName: string;
  input: Record<string, unknown>;
  options: Omit<Parameters<CanUseTool>[2], "signal">;
};
```

Renderer-side branching is based only on:

```ts
request.type === "permission_request" && request.toolName === "AskUserQuestion";
```

Why:

- this flow is already the UI projection of `canUseTool`
- if `AskUserQuestion` does not enter the message stream, adding a second request type brings little value
- following the raw `canUseTool` semantics keeps the backend and dispatch protocol stable

### How to determine the AskUserQuestion input shape

At the SDK boundary, `input` is only typed as `Record<string, unknown>`. It cannot be statically narrowed from the callback signature alone.

The MVP strategy is:

- keep the transport-level shape as `Record<string, unknown>`
- after detecting `toolName === "AskUserQuestion"` in the renderer
- use `AskUserQuestion.inputSchema.safeParse(request.input)` for runtime narrowing

The local schema is the single source of truth for this tool structure. The MVP depends on these fields:

```ts
{
  questions: {
    question: string;
    header: string;
    options: {
      label: string;
      description: string;
      preview?: string;
    }[];
    multiSelect: boolean;
  }[];
  answers?: Record<string, string>;
}
```

Notes:

- `annotations` currently exist only in the local output schema, not in the input schema
- the MVP does not send `annotations` back through `updatedInput`
- the only user-provided payload sent back is `answers`

## Renderer MVP

### 1. Single active request

Today the renderer renders every request via `pendingRequests.map(...)`. The MVP changes this to single-request presentation:

- the renderer only peeks at `pendingRequests[0]`
- it does not proactively `shift()` the queue
- after the current request resolves successfully, existing store logic removes it
- the next request automatically becomes the new active request

This ensures:

- multiple permission requests or ask-user-question requests do not stack visually
- request lifecycle remains owned by store and dispatch
- the renderer does not become responsible for queue mutation

### 2. Request router

The current single `PermissionDialog` should be elevated into a small request router:

- if `activeRequest.request.toolName !== "AskUserQuestion"`, render the existing permission dialog
- if `activeRequest.request.toolName === "AskUserQuestion"`:
  - validate `request.input` with `AskUserQuestion.inputSchema.safeParse(...)`
  - if valid, render dedicated ask-user-question UI
  - if invalid, fall back to the normal permission dialog or an error state

### 3. AskUserQuestion UI

The MVP supports:

- single-select
- multi-select
- basic rendering of `option.preview`
- submit
- cancel / deny

The MVP does not include:

- returning annotations / notes
- storing an AskUserQuestion tool card in message history
- synchronization with message parts

## Response Mapping

### Submit

When the user submits, return:

```ts
{
  behavior: "allow",
  updatedInput: {
    ...request.input,
    answers,
  },
}
```

Why:

- `updatedInput` is the only supported way to modify tool input in `canUseTool`
- this lets the SDK continue down the normal tool execution path
- the renderer does not need to understand downstream tool execution behavior

### Cancel / deny / timeout

The MVP treats all of these as:

```ts
{
  behavior: "deny",
  message: "User cancelled ask user question",
}
```

Timeout continues to use the existing permission-request timeout behavior. The MVP does not add a separate state machine for `AskUserQuestion`.

## Main Process Impact

Under this MVP, the main process protocol does not need to change:

- `session-manager.ts` continues publishing `permission_request` from `canUseTool`
- `handleDispatch()` continues receiving only `PermissionResult`
- the existing `allow + updatedInput` path remains the mechanism for continuation

Main/shared protocol changes are only needed later if we choose to add:

- explicit request-type branching
- output annotations
- a non-permission interaction model

## Out of Scope

- rendering `AskUserQuestion` as a tool part in the message stream
- adding a dedicated request type for `AskUserQuestion`
- returning annotations / notes
- static type coupling to SDK-private `sdk-tools.d.ts`
- showing multiple concurrent requests at once

## Implementation Outline

1. Add a renderer request-queue helper that returns only the active pending request
2. Replace `pendingRequests.map(...)` with rendering of a single active request
3. Add a request router that branches between the normal permission dialog and an `AskUserQuestion` dialog
4. Use `AskUserQuestion.inputSchema` to validate and narrow `request.input`
5. On submit, call `respondToRequest(requestId, { type: "permission_request", result })` with `allow + updatedInput`
6. On cancel, return `deny`

## Risks

### 1. SDK expectations around `updatedInput`

This MVP assumes the SDK will continue tool execution using `updatedInput`. The current `session-manager.ts` behavior and comments already indicate this is how the path is intended to work.

### 2. Final AskUserQuestion output visibility

Because the MVP does not use a message-stream tool part, it does not attempt to show a historical tool-output card for the completed interaction. If transcript visibility becomes a requirement later, the output presentation model will need to be redesigned.

### 3. Separation between input and output structures

The UI is currently driven only by the input schema. If we later support annotations, we will need to decide whether they belong in:

- local UI draft state only
- `updatedInput`
- or a later output projection

## Recommendation

Use the least invasive MVP:

- follow raw `canUseTool` request/response semantics
- keep all branching in the renderer
- narrow `AskUserQuestion` input through schema parsing
- show only one active request at a time, with queue progression handled by resolve-and-remove

This gives us the shortest path to a working user flow while preserving the option to move later to a dedicated request type or a message-stream tool-part model.
