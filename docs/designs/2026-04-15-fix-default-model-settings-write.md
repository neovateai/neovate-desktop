# Fix: "default" model written to ~/.claude/settings.json

## Problem

When the user selects the "default" model from the SDK Default model list in Settings > Agents > Model, the literal string `"default"` is written to `~/.claude/settings.json`. Claude Code CLI doesn't recognize `"default"` as a valid model name and errors:

```
There's an issue with the selected model (default). It may not exist or you may not have access to it.
```

## Root Cause

Claude Code SDK exposes `"default"` in its `availableModels` list (e.g. `["default", "sonnet", "haiku"]`). The `GlobalModelSelect` UI renders these as selectable options. When the user picks "default":

1. `agents-panel.tsx` `handleSelect` decodes it to `{ providerId: null, model: "default" }`
2. Calls `client.config.setGlobalModelSelection({ providerId: null, model: "default" })`
3. `config/router.ts` hits the SDK Default branch (no providerId), calls `writeModelSetting("global", "default", {})`
4. `claude-settings.ts` writes `{"model": "default"}` to `~/.claude/settings.json`
5. Claude Code CLI reads this and rejects it

Log evidence:

```
[07:35:23] setGlobalModelSelection: providerId=null model=default
[07:35:23] writeModelSetting: global scope model=default
```

## Design

Two changes: guard writes at the `writeModelSetting` level (covers all callers), and normalize reads in `getGlobalModelSelection` (self-heals existing bad state).

### Change 1: Guard writes in `writeModelSetting`

**File:** `packages/desktop/src/main/features/agent/claude-settings.ts` — `writeModelSetting`, global scope branch

Normalize `"default"` to `null` inside `writeModelSetting` when scope is `"global"`. This covers both callers (`config/router.ts:setGlobalModelSelection` and `agent/router.ts:setModelSetting`) without requiring each call site to remember the guard.

```typescript
case "global": {
  const filePath = join(homedir(), ".claude", "settings.json");
  const existing = readJsonFile(filePath) ?? {};
  // "default" is the SDK alias for "use default model" — not a real model ID.
  // Writing it to settings.json breaks Claude Code CLI.
  const effectiveModel = model === "default" ? null : model;
  if (effectiveModel === null) {
    delete existing.model;
  } else {
    existing.model = effectiveModel;
  }
  writeJsonFile(filePath, existing);
  log("writeModelSetting: global scope model=%s", effectiveModel);
  break;
}
```

### Change 2: Normalize reads in `readModelSetting`

**File:** `packages/desktop/src/main/features/agent/claude-settings.ts` — `readModelSetting`, global branch

This is the read path that feeds model to **session creation** via `session-manager.ts`. If `settings.json` contains `"model": "default"` (from the bug), treat it as unset. Without this, existing bad state still breaks new sessions.

Log evidence of this path causing the error:

```
[07:35:23] readModelSetting: global scope model=default
[07:35:23] session-manager createSession: resolved model=default scope=global
```

```typescript
// 3. Global
const globalJson = readJsonFile(join(homedir(), ".claude", "settings.json"));
// "default" is not a real model ID — ignore it (same as unset)
if (typeof globalJson?.model === "string" && globalJson.model && globalJson.model !== "default") {
  log("readModelSetting: global scope model=%s", globalJson.model);
  return { model: globalJson.model, scope: "global" };
}
```

### Change 3: Normalize reads in `getGlobalModelSelection`

**File:** `packages/desktop/src/main/features/config/router.ts` — `getGlobalModelSelection` handler

Same guard on the UI settings read path, so the settings panel shows "Auto" instead of "default" when bad state exists.

```typescript
getGlobalModelSelection: handler(({ context }) => {
    const sel = context.configStore.getGlobalSelection();
    if (sel.provider) {
      log("getGlobalModelSelection: provider=%s model=%s", sel.provider, sel.model);
      return { providerId: sel.provider, model: sel.model };
    }
    // SDK Default: read model from ~/.claude/settings.json
    try {
      const json = JSON.parse(readFileSync(join(homedir(), ".claude", "settings.json"), "utf-8"));
      // Ignore "default" — it's not a real model ID, treat as unset
      if (typeof json?.model === "string" && json.model && json.model !== "default") {
        log("getGlobalModelSelection: SDK default model=%s", json.model);
        return { model: json.model };
      }
    } catch {
      // file doesn't exist or invalid JSON
    }
    log("getGlobalModelSelection: no selection");
    return {};
  }),
```

### What doesn't change

- UI still shows "default" in the SDK model list (it comes from Claude Code, valid to display)
- Session-scoped and project-scoped model writes unaffected
- `config/router.ts:setGlobalModelSelection` write logic unchanged (the guard is now inside `writeModelSetting`)

### Why this scope is sufficient

- **Write guard in `writeModelSetting`** covers both callers that can write to `~/.claude/settings.json`: `config/router.ts:setGlobalModelSelection` (global model setting) and `agent/router.ts:setModelSetting` (when scope is `"global"`)
- **Read guard in `readModelSetting`** ensures existing bad state doesn't propagate to session creation (the actual path that triggers the CLI error)
- **Read guard in `getGlobalModelSelection`** ensures the settings UI shows "Auto" instead of "default" when bad state exists
