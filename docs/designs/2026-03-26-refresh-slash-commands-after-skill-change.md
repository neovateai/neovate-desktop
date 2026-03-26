# Refresh Slash Commands After Skill Change

## 1. Background

When skills are installed, removed, enabled, or disabled in the settings panel, the slash commands list shown in the message input (triggered by typing `/`) does not update. Users must create a new session to see the updated command list.

## 2. Requirements Summary

**Goal:** The slash command list in the message input should reactively update when skills change in settings.

**Scope:**

- In scope: Refreshing `availableCommands` in the agent store after skill mutations
- Out of scope: Changing the slash command extension or TipTap integration

## 3. Acceptance Criteria

1. When a skill is deleted in settings, the slash command list updates without session restart
2. When a skill is enabled/disabled, the command list updates immediately
3. When a skill is installed, the command list updates immediately
4. No regression in skill execution, settings UI, or session behavior

## 4. Problem Analysis

**Current state:** `availableCommands` is set once during session creation via `Query.initializationResult()`. The SDK's `Query` object (stored per session in `SessionManager.sessions`) exposes a `supportedCommands()` method that can be called at any time to get the current command list, but it's never called after the initial fetch.

**Root cause:** No bridge between skill mutations (filesystem operations) and the session's command list in the renderer's Zustand store.

## 5. Decision Log

**1. Where to trigger the refresh?**

- Options: A) In each mutation handler separately · B) In `fetchData()` callback in skills-panel
- Decision: **B)** — `fetchData()` is already called after every mutation from both `skills-panel.tsx` and `skill-detail-modal.tsx`

**2. How to get updated commands?**

- Options: A) Call `query.supportedCommands()` on existing SDK Query · B) Re-create session · C) Map skills list to commands
- Decision: **A)** — The SDK already provides this method on the stored Query object, zero overhead

## 6. Design

### New oRPC endpoint

Add `claudeCode.refreshCommands` to the agent contract:

- Input: `{ sessionId: string }`
- Output: `SlashCommandInfo[]`

### SessionManager method

Add `refreshCommands(sessionId)` that calls `this.sessions.get(sessionId).query.supportedCommands()` and returns the result.

### Renderer integration

In `skills-panel.tsx`'s `fetchData()`, after fetching the installed skills list, also call `client.agent.claudeCode.refreshCommands()` for the active session and update the agent store via `setAvailableCommands()`.

**Edge cases:**

- Skip the refresh when `activeSessionId` is null (no session active)
- Wrap the refresh call in its own try/catch — if it fails, the skills panel still works (graceful degradation, commands stay stale until next refresh)
- Only refresh the active session (YAGNI — other sessions get fresh commands via the lazy getter when they become active)

## 7. Files Changed

- `src/shared/features/agent/contract.ts` — Add `refreshCommands` endpoint to `claudeCode`
- `src/main/features/agent/session-manager.ts` — Add `refreshCommands()` method
- `src/main/features/agent/router.ts` — Add handler for `refreshCommands`
- `src/renderer/src/features/settings/components/panels/skills-panel.tsx` — Call refresh after skill mutations

## 8. Verification

1. [AC1] Remove a skill in settings → type `/` in message input → deleted skill's commands are gone
2. [AC2] Toggle a skill's enabled state → command list reflects the change
3. [AC3] Install a new skill → its commands appear in the list
4. [AC4] Run `bun ready` — no regressions
