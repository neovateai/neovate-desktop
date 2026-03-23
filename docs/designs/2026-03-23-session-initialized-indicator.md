# Session Initialized Indicator

## 1. Background

The session list sidebar shows sessions with processing indicators (spinner, permission icon, turn result dot) but has no way to tell which sessions have an active backend process — i.e., a spawned Claude Code SDK Query managed by `SessionManager`.

Users (in Developer Mode) want to see at a glance which sessions are "live" vs. cold persisted sessions on disk.

## 2. Problem Analysis

Sessions appear in two forms in the sidebar:

- `kind: "memory"` — loaded in the agent store via `SessionManager.createSession()` or `loadSession()`, has a spawned SDK process
- `kind: "persisted"` — listed from disk via `SessionManager.listSessions()`, no active process

There is no visual distinction between these two states.

- **Approach A: Backend state tracking + new store field** — Add `initializedSessions` record to store, call `session.initialize` on selection. Rejected: over-engineered, the `UnifiedItem.kind` already carries this information.
- **Chosen approach: Use `item.kind === "memory"` directly** — Zero new state, zero backend changes. Pass `isInitialized` prop from `UnifiedSessionItem` to `SessionItem`.

## 3. Decision Log

**1. How to determine "has active backend process"?**

- Options: A) New store state tracking initialization · B) Backend API call · C) Use existing `item.kind === "memory"`
- Decision: **C)** — The data already exists. A session in the agent store's `sessions` Map means `SessionManager` has a live SDK Query for it.

**2. Visual indicator style?**

- Options: A) Green dot overlay on icon · B) Left border accent · C) Icon color change
- Decision: **B) Left border** — Does not conflict with existing icon indicators (spinner, turn result, permission). Always visible including on hover. Clean and minimal.

**3. Visibility scope?**

- Options: A) Always visible · B) Developer Mode only
- Decision: **B) Developer Mode only** — This is diagnostic information, not actionable for end users.

## 4. Design

### Data Flow

```
UnifiedSessionItem receives item: UnifiedItem
  → isInitialized = item.kind === "memory"
  → passes isInitialized to SessionItem

SessionItem reads developerMode from useConfigStore
  → if developerMode && isInitialized: show green left border
  → if developerMode && !isInitialized: show transparent left border (consistent spacing)
  → if !developerMode: no border at all
```

### Implementation

`UnifiedSessionItem` passes the prop:

```tsx
<SessionItem isInitialized={item.kind === "memory"} ... />
```

`SessionItem` renders conditionally:

```tsx
className={cn(
  "flex items-center gap-2.5 ...",
  developerMode && "border-l-2",
  developerMode && (isInitialized ? "border-green-500" : "border-transparent"),
)}
```

## 5. Files Changed

- `packages/desktop/src/renderer/src/features/agent/components/unified-session-item.tsx` — Pass `isInitialized={item.kind === "memory"}` to SessionItem
- `packages/desktop/src/renderer/src/features/agent/components/session-item.tsx` — Add `isInitialized` prop, read `developerMode`, render conditional left border

## 6. Verification

1. Enable Developer Mode in settings
2. Create a new session — green left border appears
3. Restore a persisted session — border appears after load completes
4. Persisted sessions that haven't been loaded — no border (transparent)
5. Disable Developer Mode — no border on any session
6. Existing indicators (spinner, permission icon, turn result) unaffected
