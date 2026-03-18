# Input Toolbar Loading State for Session Init

## Background

When the app starts or the user switches projects, a new Claude Code session is created via an async RPC call (`claudeCodeChatManager.createSession`). During this initialization period, `activeSessionId` is `null` — the session hasn't been registered in the store yet.

## Problem

The input toolbar gives no visual feedback during this async gap. The editor is editable (since `disabled` is only true when there's no project path), so the user can type a message and click send — but `handleSend` silently no-ops because `activeSessionId` is null. The model selector and permission mode selector also disappear (they return null when there's no session), leaving a bare toolbar with no explanation.

## Decision Log

**1. Where to compute session-initializing state?**

- Options: A) Derive in AgentChat from existing state · B) Add explicit store field
- Decision: **A) Derive** — `!!activeProjectPath && !activeSessionId` precisely captures "session is being created." No store changes needed.

**2. How to pass loading to the toolbar?**

- Options: A) New `loading` prop · B) Reuse `disabled`
- Decision: **A) New `loading` prop** — Semantically different from disabled. User can type ahead while session spins up.

**3. What to show when loading?**

- Options: A) Spinner replacing send button · B) Pulsing text label · C) Both
- Decision: **A) Spinner replacing send button** — Clean, minimal. Existing `Spinner` component used. Model/permission selectors already hide when no session, so toolbar naturally looks sparse during init.

## Changes

- `agent-chat.tsx`: Derive `sessionInitializing`, pass as `sessionInitializing` to `MessageInput`
- `message-input.tsx`: Accept `sessionInitializing` prop, forward to `InputToolbar`
- `input-toolbar.tsx`: Accept `sessionInitializing` prop, show `Spinner` in send button area and pulsing "Starting session..." label
- `en-US.json` / `zh-CN.json`: Add `chat.sessionInitializing` translation key
