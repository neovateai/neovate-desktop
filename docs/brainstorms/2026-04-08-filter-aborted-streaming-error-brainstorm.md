# Filter SDK Result Errors & Improve Error Messages

**Date:** 2026-04-08
**Status:** Ready for implementation

## What We're Building

Two problems with how SDK `result` events are handled:

1. **False errors**: `error_during_execution` + `aborted_streaming` is treated as an error, but it's normal behavior (user sent a new message mid-turn). This shows a red banner and leaves status stuck in `"error"`.
2. **Unhelpful error text**: Real errors display raw subtype strings like `"error_during_execution"` because `msg.errors` contains internal diagnostics (e.g. `[ede_diagnostic] result_type=user ...`) that aren't user-facing.

## Design

### 1. Suppress `aborted_streaming`

Inline condition with a comment explaining why. If more rules are needed later, extract to a list then.

```typescript
// aborted_streaming: user sent a new message while the previous turn was still
// streaming — the SDK aborts the in-flight response. This is expected, not an error.
const isSuppressed =
  msg.subtype === "error_during_execution" && msg.terminal_reason === "aborted_streaming";
```

### 2. Human-readable error text fallback

Current code falls back to raw subtype string (e.g. `"error_during_execution"`) when `msg.errors` is empty. Use a generic fallback instead.

```typescript
const errorText = msg.errors.join("\n") || `An unexpected error occurred`;
```

## Change Summary

**File:** `packages/desktop/src/main/features/agent/sdk-message-transformer.ts`

```typescript
case "result": {
  if (this.inStep) yield { type: "finish-step" };

  // aborted_streaming: user sent a new message while the previous turn was still
  // streaming — the SDK aborts the in-flight response. This is expected, not an error.
  const isSuppressed =
    msg.subtype === "error_during_execution" && msg.terminal_reason === "aborted_streaming";
  const isError = msg.subtype !== "success" && !isSuppressed;

  if (isError) {
    yield { type: "error", errorText: msg.errors.join("\n") || `An unexpected error occurred` };
  }

  yield { type: "finish" };

  yield { type: `data-result/${msg.subtype}`, data: { result: msg.result } };
  // ...
}
```

## Key Decisions

1. **Inline condition + comment** — simple and clear for one rule. Extract to a list when a second rule appears.
2. **Match on `subtype` + `terminal_reason`** — both must match. Neither alone is sufficient.
3. **Data chunk uses real subtype** — `data-result/${msg.subtype}` instead of hardcoded `data-result/error`. Only pass `{ result: msg.result }` as data, not the entire SDK result object.
4. **Error text** — keep `msg.errors` as-is, fall back to `Unexpected error: <subtype>` when empty (instead of raw subtype).

## Open Questions

None — all decisions resolved during brainstorm.
