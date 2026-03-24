# Incremental "Show More" in Per-Project Session List

## Problem

In multi-project mode, the per-project accordion expands sessions with a binary toggle: show first 5 or show all. For projects with many sessions, "show all" dumps too many items at once.

## Scope

Only `ProjectSessions` in `project-accordion-list.tsx`. `ChronologicalList` keeps its existing behavior.

## Design

### State change

```diff
- const [expanded, setExpanded] = useState(false);
+ const [visibleCount, setVisibleCount] = useState(DEFAULT_SESSION_LIMIT);
```

### Derived values

```ts
const visibleItems = items.slice(0, visibleCount);
const remainingCount = items.length - visibleCount;
```

### Button logic (single button, swaps label)

| Condition                                                                      | Label                                                                             | Action                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------- |
| `remainingCount > 0`                                                           | `Show ${Math.min(DEFAULT_SESSION_LIMIT, remainingCount)} more of ${items.length}` | `setVisibleCount(c => c + DEFAULT_SESSION_LIMIT)` |
| `visibleCount > DEFAULT_SESSION_LIMIT && items.length > DEFAULT_SESSION_LIMIT` | `Show less`                                                                       | `setVisibleCount(DEFAULT_SESSION_LIMIT)`          |
| `items.length <= DEFAULT_SESSION_LIMIT`                                        | (no button)                                                                       | -                                                 |

### Animation

Use `motion` (project standard) to animate newly revealed items. Wrap each session item in `motion.li` with a fade-in/slide-down via `AnimatePresence`:

```tsx
import { AnimatePresence, motion } from "motion/react";

<AnimatePresence initial={false}>
  {visibleItems.map((item) => {
    const id = item.kind === "memory" ? item.session.sessionId : item.info.sessionId;
    return (
      <motion.li
        key={id}
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0, transition: { duration: 0 } }}
        transition={{ duration: 0.15 }}
      >
        <UnifiedSessionItem ... />
      </motion.li>
    );
  })}
</AnimatePresence>
```

### UX decisions

- "Show less" always resets to the initial 5 (not decremental).
- Only one button shown at a time; it swaps between "Show N more of X" and "Show less".
- `DEFAULT_SESSION_LIMIT` stays at 5.
- Total count shown in "Show more" label to give users context on list depth.
- "Show less" condition guards against stale state: `visibleCount > DEFAULT_SESSION_LIMIT && items.length > DEFAULT_SESSION_LIMIT`. Prevents showing "Show less" when sessions are deleted below the default limit.
- Newly revealed items animate in with fade + height transition (motion library).
- Collapse (exit) is instant (`duration: 0`) to avoid sluggish feel when many items disappear at once.

### Files changed

- `packages/desktop/src/renderer/src/features/agent/components/project-accordion-list.tsx` (ProjectSessions component only)
