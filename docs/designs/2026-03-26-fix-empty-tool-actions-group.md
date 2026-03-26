# Fix: Empty tool actions group after simple assistant messages

## 1. Background

When sending a simple text message (e.g. "hi") that results in a response with no thinking block and no tool calls, an empty collapsible section still renders below the assistant message. This is a cosmetic bug reported in #300.

## 2. Requirements Summary

**Goal:** Prevent empty collapsible sections from appearing after text-only assistant messages.

**Scope:**

- In scope: Fix the condition that triggers the collapsible UI
- Out of scope: Refactoring the collapse mechanism or changing its behavior for messages that DO have tools/reasoning

## 3. Acceptance Criteria

1. A simple text-only assistant response (no tools, no reasoning) must NOT render a collapsible section
2. Messages with tool calls still render the collapsible correctly
3. Messages with reasoning still render the collapsible correctly
4. Restored sessions with tool/reasoning messages still collapse correctly

## 4. Problem Analysis

In `use-assistant-message-summary-collapse.ts`, the `hasSummaryContent` variable determines whether the collapsible UI activates. The current (committed) condition is:

```ts
const hasSummaryContent = toolCallCount > 0 || messageCount > 0 || reasoningCount > 0;
```

`messageCount` counts text/file parts that appear alongside tool calls. For a text-only response with no tools and no reasoning, `messageCount = 1` (the text response), causing `hasSummaryContent = true` and triggering the collapsible with nothing meaningful to show.

The `hasRestoredProcessContent` variable on line 151 already correctly excludes `messageCount`:

```ts
const hasRestoredProcessContent = toolCallCount > 0 || reasoningCount > 0;
```

## 5. Decision Log

**1. Should messageCount factor into hasSummaryContent?**

- Options: A) Keep messageCount in the condition · B) Remove messageCount
- Decision: **B)** — Text/file parts alone don't warrant collapsing. They only provide context when grouped with tools or reasoning. The restored-session path already made this correct distinction.

## 6. Design

Remove `messageCount > 0` from the `hasSummaryContent` condition. This makes it consistent with the `hasRestoredProcessContent` check and prevents the collapsible from activating for text-only messages.

## 7. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/use-assistant-message-summary-collapse.ts` — remove `messageCount > 0` from `hasSummaryContent`

## 8. Verification

1. [AC1] Send "hi" in chat — no collapsible section below the response
2. [AC2] Send a message that triggers tool calls — collapsible works normally
3. [AC3] Send a message that triggers reasoning — collapsible works normally
4. [AC4] Reload a session with tool calls — collapsed view works normally
