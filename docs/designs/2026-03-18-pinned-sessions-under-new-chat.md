# Pinned Sessions Under New Chat

## Decision Log

| #   | Question                | Options                                              | Decision | Reasoning                                                                                                    |
| --- | ----------------------- | ---------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| 1   | Which mode is affected? | A) Multi-project only B) Single-project only C) Both | A        | Single-project already renders pinned below NewChatButton. Multi-project renders PinnedSessionList above it. |
| 2   | How to fix the order?   | A) Swap JSX B) CSS order                             | A        | Simple JSX reorder is sufficient.                                                                            |

## Change

In `session-list.tsx` → `MultiProjectSessionList`, swap `<PinnedSessionList />` and `<NewChatButton>` so pinned sessions render below the New Chat button, matching single-project mode behavior.

## Files

- `packages/desktop/src/renderer/src/features/agent/components/session-list.tsx`
