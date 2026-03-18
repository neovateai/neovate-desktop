# Model Check: Show Detailed Info on Failure

**Date:** 2026-03-18
**Status:** Implemented

## Problem

When a model check (benchmark) fails, the error details are hidden behind a tiny tooltip showing a raw `String(err)` dump. Users cannot easily see _why_ a model check failed (auth error, model not found, rate limit, network issue, etc.).

## Decision Log

| #   | Question                                | Options                                                                                                 | Decision | Reasoning                                                                                                                      |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Where to extract structured error info? | A) Backend: parse Anthropic SDK error B) Frontend: parse error string                                   | A        | Backend has access to the actual error object with `status`, `message` properties                                              |
| 2   | How to display failure details?         | A) Keep tooltip-only B) Show error inline below the model row C) Expand the badge to include error text | B+C      | Show "Failed" badge inline plus the error message directly below the row — tooltip is too hidden for important diagnostic info |
| 3   | Add new fields to contract schema?      | A) Add `errorCode` field B) Keep single `error` string, make it better formatted                        | B        | YAGNI — a well-formatted error string is sufficient                                                                            |
| 4   | How verbose should the error be?        | A) Just HTTP status + message B) Status + error type + message                                          | B        | Developers want to know _why_ it failed (auth error, model not found, rate limit, etc.)                                        |

## Design

### Backend (`src/main/features/provider/router.ts`)

In `runBenchmark`'s catch block, detect the error type and extract structured info:

- **`Anthropic.APIError`**: Extract HTTP status, error type from JSON body (e.g. `authentication_error`), and message. Format: `401 — authentication_error — invalid x-api-key`
- **Other `Error`**: Use `err.message`
- **Fallback**: `String(err)`

### Frontend (`providers-panel.tsx`)

When a model check fails:

- The "Failed" badge remains visible inline (no change)
- The error message is rendered directly below the model row as `text-xs text-destructive` text
- Removed the tooltip wrapper for failed state — error is now always visible

## Files Changed

- `packages/desktop/src/main/features/provider/router.ts` — Structured error extraction in `runBenchmark` catch block
- `packages/desktop/src/renderer/src/features/settings/components/panels/providers-panel.tsx` — Inline error display for failed model checks
