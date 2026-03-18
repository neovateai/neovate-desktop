# Session List: Don't Show Empty State When Not Loaded

## Problem

The session list shows `EmptySessionState` immediately on mount, before sessions have been fetched from the backend. The store initializes `agentSessions` as `[]`, which is indistinguishable from "fetched and got zero results".

## Decision Log

| #   | Question                    | Options                                                                                                           | Decision | Reasoning                                                                                                                                                                                                                        |
| --- | --------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | How to track loaded state?  | A) `sessionsLoaded` boolean in agent store B) Local state per component C) `agentSessions: null \| SessionInfo[]` | A        | Store-level boolean is simplest; all three list components share the same data source. Null union would require changing all consumers.                                                                                          |
| 2   | What to show before loaded? | A) Nothing B) Skeleton/spinner                                                                                    | A        | Less visual noise; the fetch is fast, so showing nothing avoids a flash of loading UI.                                                                                                                                           |
| 3   | When to reset loaded flag?  | A) Never reset B) Reset when `setAgentSessions([])` is called from the no-project path                            | B        | When there's no project, the effect explicitly clears sessions — `setAgentSessions([])` sets `sessionsLoaded: true`, which is correct (sessions are genuinely empty). On initial mount before any effect runs, it stays `false`. |

## Architecture

- Added `sessionsLoaded: boolean` to `AgentState` in `store.ts`, initialized `false`.
- `setAgentSessions` sets `sessionsLoaded: true` alongside `agentSessions`.
- Three components gate `EmptySessionState` on `sessionsLoaded`:
  - `SingleProjectSessionList` in `session-list.tsx`
  - `ChronologicalList` in `chronological-list.tsx`
  - `ProjectSessions` in `project-accordion-list.tsx`

## Data Flow

```
mount -> agentSessions=[], sessionsLoaded=false -> render nothing
  |
  v
effect fires -> client.agent.listSessions()
  |
  v
setAgentSessions(results) -> sessionsLoaded=true
  |
  v
results.length === 0 -> show EmptySessionState
results.length > 0   -> show session list
```

## Files Modified

- `packages/desktop/src/renderer/src/features/agent/store.ts`
- `packages/desktop/src/renderer/src/features/agent/components/session-list.tsx`
- `packages/desktop/src/renderer/src/features/agent/components/chronological-list.tsx`
- `packages/desktop/src/renderer/src/features/agent/components/project-accordion-list.tsx`
