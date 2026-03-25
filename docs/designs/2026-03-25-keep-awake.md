# Keep Awake Setting

## 1. Background

When a long-running task is streaming, macOS (and other OSes) may put the computer to sleep, killing the agent subprocess and losing progress. Users need a way to prevent system sleep while tasks are actively running.

## 2. Requirements Summary

**Goal:** Add a "Keep Awake" toggle to chat settings that prevents system sleep while a task is actively running.

**Scope:**

- In scope: Global config toggle (default off), powerSaveBlocker tied to turn lifecycle, UI toggle in chat settings
- Out of scope: Per-session settings, display sleep prevention, renderer-side blocker state indicator

## 3. Acceptance Criteria

1. A "Keep Awake" toggle exists in chat settings, default off
2. When enabled and a task is streaming/submitted, system sleep is prevented via `powerSaveBlocker`
3. When all tasks complete (or setting is turned off), the blocker is released
4. The blocker uses `prevent-app-suspension` type (keeps process alive, allows screen dimming)
5. Toggling off mid-task immediately releases the blocker
6. `bun ready` passes with the changes

## 4. Problem Analysis

No prior art in the codebase. The `keepAwake` config field and `PowerBlockerService` class were stubbed out but never wired into the application lifecycle.

- **Approach A: External orchestration in index.ts** — listen for session events and call powerSaveBlocker directly -> rejected (scattered logic, no encapsulation)
- **Approach B: Generic listener interface on SessionManager** -> rejected (over-engineered for one consumer)
- **Chosen approach: Constructor injection** — PowerBlockerService is a direct dependency of SessionManager, called at turn start/end boundaries. Self-subscribes to config changes via `ConfigStore.onChange()`.

## 5. Decision Log

**1. What type of sleep to prevent?**

- Options: A) `prevent-display-sleep` (keeps screen on) · B) `prevent-app-suspension` (allows screen dimming) · C) Both
- Decision: **B)** — Users want the process alive, not necessarily the screen on. Saves battery on laptops.

**2. When should the blocker activate?**

- Options: A) Turn-level (submitted/streaming) · B) Session-level (any active session) · C) Streaming only
- Decision: **A)** — Most useful and power-efficient. Prevents sleep only when work is actually happening.

**3. Where to manage the powerSaveBlocker lifecycle?**

- Options: A) Inside SessionManager · B) Separate service as constructor dependency · C) In index.ts as a listener
- Decision: **B)** — Follows existing patterns (like RequestTracker). Keeps SessionManager focused.

**4. How to react to config changes mid-task?**

- Options: A) Manual `onConfigChanged()` call from router · B) `ConfigStore.onChange()` self-subscription
- Decision: **B)** — Zero wiring needed in the config router. PowerBlockerService subscribes in its constructor and reconciles immediately when keepAwake changes.

**5. Global or per-session?**

- Options: A) Global · B) Per-session
- Decision: **A)** — `powerSaveBlocker` is system-level. One toggle affects all sessions.

## 6. Design

### Architecture

```
ConfigStore.onChange("keepAwake") ──> PowerBlockerService.reconcile()
                                          ^
SessionManager.stream()  ──> onTurnStart ─┘
SessionManager.stream()  ──> onTurnEnd  ──┘  (finally block)
SessionManager.closeSession() ──> onSessionClosed ──┘
```

PowerBlockerService tracks active turns in a `Set<string>` keyed by sessionId. On every state change (turn start, turn end, session close, config change), it calls `reconcile()` which compares desired state (`keepAwake && activeTurns.size > 0`) against current blocker state and starts/stops accordingly.

### Key details

- **`prevent-app-suspension`** keeps the process alive but allows display sleep — optimal for background tasks
- **`finally` block** in `stream()` ensures `onTurnEnd` fires even if the stream throws
- **`dispose()`** cleans up the config subscription and stops any active blocker on app quit
- **Constructor injection** means PowerBlockerService is always present (no optional chaining)

### Config plumbing

Already existed before this work:

- `AppConfig.keepAwake: boolean` in `src/shared/features/config/types.ts`
- Zod validation in `src/shared/features/config/contract.ts`
- Default `false` in both renderer and main config stores

Added:

- `ConfigStore.onChange(key, cb)` — generic reactive subscription wrapping `electron-store`'s `onDidChange`

## 7. Files Changed

- `src/main/core/power-blocker-service.ts` — Self-subscribes to keepAwake config, constructor takes ConfigStore
- `src/main/features/agent/session-manager.ts` — PowerBlockerService as 4th constructor param, calls onTurnStart/onTurnEnd/onSessionClosed
- `src/main/features/agent/__tests__/session-manager.test.ts` — Mock PowerBlockerService in test setup
- `src/main/features/config/config-store.ts` — Add `onChange()` method
- `src/main/index.ts` — Instantiate PowerBlockerService, pass to SessionManager, dispose on quit
- `src/renderer/src/features/settings/components/panels/chat-panel.tsx` — Add Switch toggle
- `src/renderer/src/locales/en-US.json` — Add keepAwake translation keys
- `src/renderer/src/locales/zh-CN.json` — Add keepAwake Chinese translations
- `src/shared/features/config/types.ts` — (pre-existing) keepAwake field
- `src/shared/features/config/contract.ts` — (pre-existing) keepAwake zod schema
- `src/renderer/src/features/config/store.ts` — (pre-existing) keepAwake default

## 8. Verification

1. [AC1] Open Settings > Chat > verify "Keep Awake" / "保持唤醒" toggle appears, default off
2. [AC2] Enable toggle, start a task, check `DEBUG=neovate:power-blocker` logs for `started: id=N activeTurns=1`
3. [AC3] When task completes, verify `stopped:` log appears
4. [AC4] Confirm log shows `prevent-app-suspension` (hardcoded in reconcile)
5. [AC5] Toggle off mid-task, verify `stopped:` log fires immediately (not waiting for task end)
6. [AC6] `bun ready` passes (format + typecheck + lint + 271 tests)
