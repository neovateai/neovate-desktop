# Performance & DX Optimization

## 1. Background

Inspired by Innei's LobeHub performance optimization blog post, this addresses re-render overhead from Zustand selector patterns, uncapped tool output rendering, and main process bundle bloat.

## 2. Requirements Summary

**Goal:** Reduce unnecessary re-renders via Zustand selector optimization, prevent UI freezes from large tool outputs, and shrink the shipped app by bundling pure-JS main process dependencies.

**Scope:**

- In scope: useShallow adoption, session selector hooks, tool output capping, main process dep bundling
- Out of scope: Chat message virtualization (deferred — messages already memo'd, tool output capping addresses DOM bloat)

## 3. Acceptance Criteria

1. All components with 3+ state selectors from the same store use `useShallow` for combined selection
2. A `useSessionField` hook exists to access session data without Map-wide re-renders
3. Tool output components cap initial render at ~150 lines with "Show all" expand
4. Main process bundles all pure-JS dependencies; only native deps remain in shipped node_modules
5. `bun ready` passes after all changes

## 4. Decision Log

**1. useShallow: Combine state selectors or everything?**

- Options: A) Combine everything · B) State + actions together · C) State only, actions stay separate
- Decision: **C)** — Zustand actions are stable references, never trigger re-renders. Only combine state selectors.

**2. Tool output capping: Where to implement?**

- Options: A) Each tool component · B) Shared CodeBlock component · C) Wrapper component
- Decision: **B)** — Add `maxLines` prop to CodeBlock. Avoids duplication across 6 tool components.

**3. Main process bundling: Scope?**

- Options: A) Bundle all pure-JS deps · B) Selective · C) Keep current
- Decision: **A)** — List all pure-JS deps in externalizeDeps.exclude. Eliminates most node_modules from package.

## 5. Design

### useShallow Adoption

Components with 3+ state selectors from the same store get consolidated:

- `network-view.tsx` — 6 state selectors from useNetworkStore
- `agent-chat.tsx` (AgentChat) — 5 state selectors from useAgentStore
- `session-list.tsx` (SingleProjectSessionList) — 5+4 state selectors from useAgentStore+useProjectStore
- `input-toolbar.tsx` (ConnectedModelSelect) — 4 state selectors from useAgentStore, 3 from useProviderStore
- `providers-panel.tsx` — 6 state selectors from useProviderStore
- `project-accordion-list.tsx` (ProjectSessions) — 3 state selectors from useAgentStore
- `session-item.tsx` — 3 state selectors from useConfigStore
- `sidebar-title-bar.tsx` — 3 from useConfigStore
- `chronological-list.tsx` — 3 from useAgentStore
- `pinned-session-list.tsx` — 2 from useAgentStore (borderline, include for consistency)
- `session-info-bar.tsx` — 3 from useAgentStore
- `session-actions-menu.tsx` — 3 from useProjectStore, 2 from useAgentStore (sessions.get pattern)

### Session Selector Hook

Create `useSessionField(sessionId, field)` in `features/agent/hooks/use-session-field.ts`.

### Tool Output Capping

Add `maxLines` prop to `CodeBlock`. When set, render only first N lines and show a "Show all (X lines)" button. Tool components pass `maxLines={150}`.

### Main Process Bundling

Add all pure-JS production deps to `externalizeDeps.exclude` in electron.vite.config.ts.

## 6. Files Changed

- `src/renderer/src/features/agent/hooks/use-session-field.ts` — new hook
- `src/renderer/src/components/ai-elements/code-block.tsx` — add maxLines prop
- `src/renderer/src/plugins/network/network-view.tsx` — useShallow
- `src/renderer/src/features/agent/components/agent-chat.tsx` — useShallow
- `src/renderer/src/features/agent/components/session-list.tsx` — useShallow
- `src/renderer/src/features/agent/components/input-toolbar.tsx` — useShallow + useSessionField
- `src/renderer/src/features/agent/components/session-actions-menu.tsx` — useShallow + useSessionField
- `src/renderer/src/features/agent/components/session-info-bar.tsx` — useShallow
- `src/renderer/src/features/agent/components/session-item.tsx` — useShallow
- `src/renderer/src/features/agent/components/sidebar-title-bar.tsx` — useShallow
- `src/renderer/src/features/agent/components/chronological-list.tsx` — useShallow
- `src/renderer/src/features/agent/components/pinned-session-list.tsx` — useShallow
- `src/renderer/src/features/agent/components/project-accordion-list.tsx` — useShallow
- `src/renderer/src/features/settings/components/panels/providers-panel.tsx` — useShallow
- `src/renderer/src/features/agent/components/tool-parts/read-tool.tsx` — maxLines
- `src/renderer/src/features/agent/components/tool-parts/bash-tool.tsx` — maxLines
- `src/renderer/src/features/agent/components/tool-parts/grep-tool.tsx` — maxLines
- `src/renderer/src/features/agent/components/tool-parts/bash-output-tool.tsx` — maxLines
- `src/renderer/src/features/agent/components/tool-parts/write-tool.tsx` — maxLines
- `electron.vite.config.ts` — bundle pure-JS deps

## 7. Verification

1. [AC1] Grep for 3+ consecutive `useXxxStore((s) =>` calls — should find none
2. [AC2] `useSessionField` hook exists and is used in components that access sessions.get()
3. [AC3] Open a tool output with 200+ lines — only ~150 shown with expand button
4. [AC4] Check electron.vite.config.ts has pure-JS deps in exclude list
5. [AC5] `bun ready` passes
