# Permission Mode Feature

## Summary

Rename `approvalMode` to `permissionMode` in the config layer, pass it to the SDK when creating sessions, add a permission mode selector dropdown to the input toolbar, and support Shift+Tab to toggle plan mode in the message input.

## 1. Rename `approvalMode` to `permissionMode` in config layer

### Type change

- `shared/features/config/types.ts`: Remove `ApprovalMode = "default" | "autoEdit" | "yolo"`. Add `ConfigPermissionMode = "default" | "acceptEdits" | "bypassPermissions"`. Rename field `approvalMode` -> `permissionMode` in `AppConfig`.
- Keep `PermissionMode` in `shared/features/agent/types.ts` as the full SDK runtime type (`"default" | "acceptEdits" | "bypassPermissions" | "plan" | "dontAsk"`). The config type (`ConfigPermissionMode`) is a subset — only the 3 persistable base modes.

### Files touched

- `shared/features/config/types.ts` — type + field rename
- `shared/features/config/contract.ts` — zod schema: rename `approvalModeValueSchema` to `permissionModeValueSchema`, values: `["default", "acceptEdits", "bypassPermissions"]`
- `main/features/config/config-store.ts` — default value: `permissionMode: "default"`
- `renderer/features/config/store.ts` — default value
- `renderer/features/settings/components/panels/chat-panel.tsx` — settings UI
- `renderer/locales/en-US.json` — i18n keys (`settings.chat.approvalMode.*` -> `settings.chat.permissionMode.*`)
- `renderer/locales/zh-CN.json` — i18n keys

## 2. Pass config permissionMode to session-manager

In `session-manager.ts` `queryOptions()`: replace hardcoded `permissionMode: "default"` with `this.configStore.get("permissionMode")`.

`createSession` already has access to `this.configStore`, so this is a one-line change in `queryOptions`.

## 3. Track permissionMode per-session in agent store

- Add `permissionMode?: PermissionMode` to `ChatSession` type in `renderer/features/agent/store.ts`
- Add `setPermissionMode(sessionId, mode)` action — same pattern as `setCurrentModel`
- Initialize from config when `registerSessionInStore` is called (add `permissionMode` to the capabilities parameter)

## 4. PermissionModeSelect dropdown in input-toolbar

New component in `input-toolbar.tsx`, placed next to `ModelSelect`:

- Dropdown with 4 options: `default`, `acceptEdits`, `plan`, `bypassPermissions`
- Display labels: "Default", "Auto Edit", "Plan", "YOLO"
- On change: update agent store via `setPermissionMode` + dispatch `set_permission_mode` to the SDK session via `claudeCodeChatManager`
- Does NOT persist to config store — session-level only

## 5. Shift+Tab toggle in message-input

In the `chatKeymap` plugin's `handleKeyDown` in `message-input.tsx`:

- Detect `Shift+Tab` (`event.key === "Tab" && event.shiftKey`)
- Read current `permissionMode` from agent store for the active session
- If current is `"plan"` -> switch back to the **config-stored** permissionMode (from config store, not "previous dropdown value")
- If current is anything else -> switch to `"plan"`
- Dispatch `set_permission_mode` to SDK + update agent store

### Toggle-back behavior

The "config default" for toggle-back always comes from `configStore.permissionMode`, NOT from whatever was previously selected in the dropdown. This is predictable: Shift+Tab always toggles between `plan` and the user's persisted preference.

## 6. Plan mode visual indicator

When `permissionMode === "plan"` for the active session, show a small pill/badge inside the input container (above the editor, inside the rounded border). Example: a subtle `"Plan mode"` label with a distinct background. Disappears when mode switches back.

## State flow

```
Config Store (persisted)
  permissionMode: "default" | "acceptEdits" | "bypassPermissions"
       |
       | (read on session create)
       v
Session Manager (SDK Options)
  permissionMode: configStore.get("permissionMode")
       |
       | (initial value)
       v
Agent Store (per-session runtime)
  permissionMode: "default" | "acceptEdits" | "bypassPermissions" | "plan"
       ^                    ^
       |                    |
  Toolbar dropdown     Shift+Tab toggle
  (any of 4 values)    (plan <-> config default)
       |                    |
       v                    v
  SDK dispatch: set_permission_mode
```
