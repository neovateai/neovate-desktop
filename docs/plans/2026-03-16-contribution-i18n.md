# Contribution i18n Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `ContentPanelView.name` translatable via `%namespace:key%` NLS markers, with reactive language switching.

**Architecture:** Add `useTranslationWithMarker` hook to `core/i18n/`. Plugins write `%namespace:key%` in `name`. UI components call the hook to resolve markers. Delete old `resolveNls` and app-level `tab.*` translation keys.

**Tech Stack:** i18next, react-i18next, vitest

---

### Task 1: Create `useTranslationWithMarker` hook

**Files:**

- Create: `packages/desktop/src/renderer/src/core/i18n/nls.ts`
- Modify: `packages/desktop/src/renderer/src/core/i18n/index.ts`

**Step 1: Write the test**

Create `packages/desktop/src/renderer/src/core/i18n/__tests__/nls.test.ts`:

```typescript
import { renderHook } from "@testing-library/react";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import { beforeAll, describe, expect, it } from "vitest";

import { useTranslationWithMarker } from "../nls";

beforeAll(async () => {
  await i18next.use(initReactI18next).init({
    resources: {
      "en-US": {
        "plugin-test": { "view.hello": "Hello" },
      },
    },
    lng: "en-US",
    keySeparator: false,
  });
});

describe("useTranslationWithMarker", () => {
  it("resolves %namespace:key% marker to translated string", () => {
    const { result } = renderHook(() => useTranslationWithMarker());
    expect(result.current("%plugin-test:view.hello%")).toBe("Hello");
  });

  it("returns non-marker strings as-is", () => {
    const { result } = renderHook(() => useTranslationWithMarker());
    expect(result.current("plain string")).toBe("plain string");
  });

  it("returns empty string as-is", () => {
    const { result } = renderHook(() => useTranslationWithMarker());
    expect(result.current("")).toBe("");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test:run src/renderer/src/core/i18n/__tests__/nls.test.ts`
Expected: FAIL — module `../nls` not found

**Step 3: Write implementation**

Create `packages/desktop/src/renderer/src/core/i18n/nls.ts`:

```typescript
import { useTranslation } from "react-i18next";

const NLS_MARKER_RE = /^%([^%]+)%$/;

/**
 * React hook that resolves `%namespace:key%` NLS markers to translated strings.
 * Non-marker strings are returned as-is.
 * Reactive: re-renders on language change.
 */
export function useTranslationWithMarker() {
  const { t } = useTranslation();
  return (value: string) => {
    const match = NLS_MARKER_RE.exec(value);
    return match ? t(match[1]) : value;
  };
}
```

**Step 4: Export from index**

In `packages/desktop/src/renderer/src/core/i18n/index.ts`, add:

```typescript
export { useTranslationWithMarker } from "./nls";
```

**Step 5: Run test to verify it passes**

Run: `bun test:run src/renderer/src/core/i18n/__tests__/nls.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/desktop/src/renderer/src/core/i18n/nls.ts \
       packages/desktop/src/renderer/src/core/i18n/__tests__/nls.test.ts \
       packages/desktop/src/renderer/src/core/i18n/index.ts
git commit -m "feat: add useTranslationWithMarker hook for NLS marker resolution"
```

---

### Task 2: Remove `resolveNls` from `contributions.ts`

**Files:**

- Modify: `packages/desktop/src/renderer/src/core/plugin/contributions.ts:58-66` — delete NLS section (`NLS_REGEX`, `resolveNls`)
- Modify: `packages/desktop/src/renderer/src/components/app-layout/app-layout.tsx:23,246` — switch to `useTranslationWithMarker`

**Step 1: Delete NLS section from contributions.ts**

Remove lines 58–66 (the `// ─── NLS` comment, `NLS_REGEX`, `resolveNls` function) and the `import i18next` on line 4.

**Step 2: Migrate app-layout.tsx**

Replace `resolveNls` import:

```typescript
// Before
import { resolveNls, type TitlebarItem } from "../../core/plugin/contributions";

// After
import { type TitlebarItem } from "../../core/plugin/contributions";
import { useTranslationWithMarker } from "../../core/i18n";
```

In `AppLayoutSecondaryTitleBar`, add the hook call and replace usage:

```typescript
// Add inside the component
const tMarker = useTranslationWithMarker();

// Replace line 246
// Before: payload={resolveNls(item.tooltip)}
// After:  payload={tMarker(item.tooltip)}
```

Note: `item.tooltip` is `string | undefined`. The `tMarker` function handles strings only. Guard with `item.tooltip ? tMarker(item.tooltip) : undefined` or keep the existing `item.tooltip ?` conditional that already wraps this.

**Step 3: Run checks**

Run: `bun check`
Expected: PASS — no type errors, no lint issues

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/core/plugin/contributions.ts \
       packages/desktop/src/renderer/src/components/app-layout/app-layout.tsx
git commit -m "refactor: move NLS resolution from contributions to core/i18n"
```

---

### Task 3: Migrate tab-item.tsx and new-tab-menu.tsx

**Files:**

- Modify: `packages/desktop/src/renderer/src/features/content-panel/components/tab-item.tsx`
- Modify: `packages/desktop/src/renderer/src/features/content-panel/components/new-tab-menu.tsx`

**Step 1: Migrate tab-item.tsx**

Replace imports:

```typescript
// Remove
import { useTranslation } from "react-i18next";

// Add
import { useTranslationWithMarker } from "../../../core/i18n";
```

Delete `type TabName = "Editor" | "Git Diff" | "Terminal" | "Review";` (line 12).

In `TabButton`:

```typescript
// Replace: const { t } = useTranslation();
const tMarker = useTranslationWithMarker();

// Replace line 27: find view by viewType instead of name
const view = views.find((view) => view.viewType === tab.viewType);

// Replace line 45: tab title
<span className="truncate font-medium">{tMarker(tab.name)}</span>
```

For orphan tooltip (line 84):

```typescript
// Before
&quot;{tab.name}&quot; is unavailable. You can close this tab.

// After — use tMarker so marker names display translated
&quot;{tMarker(tab.name)}&quot; is unavailable. You can close this tab.
```

Note: the orphan tooltip text itself (`is unavailable...`) should also be translated via app-level i18n, but that's out of scope for this task.

**Step 2: Migrate new-tab-menu.tsx**

Replace imports:

```typescript
// Remove
import { useTranslation } from "react-i18next";

// Add
import { useTranslationWithMarker } from "../../../core/i18n";
```

Delete `type TabName = "Editor" | "Git Diff" | "Terminal" | "Review";` (line 13).

In `NewTabMenu`:

```typescript
// Replace: const { t } = useTranslation();
const tMarker = useTranslationWithMarker();

// Replace line 43
// Before: {t(`tab.${view.name as TabName}`)}
// After:  {tMarker(view.name)}
```

**Step 3: Run checks**

Run: `bun check`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/features/content-panel/components/tab-item.tsx \
       packages/desktop/src/renderer/src/features/content-panel/components/new-tab-menu.tsx
git commit -m "refactor: use useTranslationWithMarker for tab display names"
```

---

### Task 4: Update plugins — git and review (have existing i18n)

**Files:**

- Modify: `packages/desktop/src/renderer/src/plugins/git/index.tsx:48`
- Modify: `packages/desktop/src/renderer/src/plugins/git/locales/en-US.json`
- Modify: `packages/desktop/src/renderer/src/plugins/git/locales/zh-CN.json`
- Modify: `packages/desktop/src/renderer/src/plugins/review/index.tsx:35`
- Modify: `packages/desktop/src/renderer/src/plugins/review/locales/en-US.json`
- Modify: `packages/desktop/src/renderer/src/plugins/review/locales/zh-CN.json`

**Step 1: Update git plugin**

In `plugins/git/index.tsx`, change `name`:

```typescript
// Before: name: "Git Diff",
name: "%plugin-git:view.gitDiff%",
```

Add to `plugins/git/locales/en-US.json`:

```json
"view.gitDiff": "Git Diff"
```

Add to `plugins/git/locales/zh-CN.json`:

```json
"view.gitDiff": "代码变更"
```

**Step 2: Update review plugin**

In `plugins/review/index.tsx`, change `name`:

```typescript
// Before: name: "Review",
name: "%plugin-review:view.review%",
```

Add to `plugins/review/locales/en-US.json`:

```json
"view.review": "Review"
```

Add to `plugins/review/locales/zh-CN.json`:

```json
"view.review": "评审"
```

**Step 3: Commit**

```bash
git add packages/desktop/src/renderer/src/plugins/git/ \
       packages/desktop/src/renderer/src/plugins/review/
git commit -m "feat: use NLS markers for git and review contentPanelView names"
```

---

### Task 5: Update plugins — editor, terminal (need i18n setup)

These plugins have no `configI18n` or locale files. Add them.

**Files:**

- Modify: `packages/desktop/src/renderer/src/plugins/editor/index.tsx`
- Create: `packages/desktop/src/renderer/src/plugins/editor/locales/en-US.json`
- Create: `packages/desktop/src/renderer/src/plugins/editor/locales/zh-CN.json`
- Modify: `packages/desktop/src/renderer/src/plugins/terminal/index.tsx`
- Create: `packages/desktop/src/renderer/src/plugins/terminal/locales/en-US.json`
- Create: `packages/desktop/src/renderer/src/plugins/terminal/locales/zh-CN.json`

**Step 1: Add i18n to editor plugin**

Create `plugins/editor/locales/en-US.json`:

```json
{
  "view.editor": "Editor"
}
```

Create `plugins/editor/locales/zh-CN.json`:

```json
{
  "view.editor": "编辑器"
}
```

In `plugins/editor/index.tsx`, add `configI18n` and update `name`:

```typescript
const plugin: RendererPlugin = {
  name: "builtin:editor",

  configI18n() {
    return {
      namespace: "builtin:editor",
      loader: async (locale) => {
        try {
          return (await import(`./locales/${locale}.json`)).default;
        } catch {
          return (await import("./locales/en-US.json")).default;
        }
      },
    };
  },

  // ... activate stays the same

  configContributions() {
    return {
      contentPanelViews: [
        {
          viewType: "editor",
          name: "%builtin:editor:view.editor%",  // namespace is "builtin:editor"
          // ...rest stays the same
```

Note: the plugin name is `"builtin:editor"` so the namespace is `"builtin:editor"`. The marker becomes `%builtin:editor:view.editor%`. i18next colon syntax uses the first colon as namespace separator, so `t("builtin:editor:view.editor")` looks up key `"editor:view.editor"` in namespace `"builtin"` — **this won't work**.

**Important:** Since `builtin:editor` contains a colon, i18next will misparse it. Use the i18next `ns` option convention: the first `:` separates namespace from key. Two options:

- (a) Change plugin name/namespace to `plugin-editor` (no colon)
- (b) Use a different separator

**Recommend (a):** Align with git/review which already use `plugin-git`, `plugin-review`. Update the plugin `name` field too for consistency, or keep `name` as-is and just use a different namespace string.

Simplest: use `"plugin-editor"` as the namespace (independent of `plugin.name`):

```typescript
configI18n() {
  return {
    namespace: "plugin-editor",
    loader: async (locale) => {
      try {
        return (await import(`./locales/${locale}.json`)).default;
      } catch {
        return (await import("./locales/en-US.json")).default;
      }
    },
  };
},
```

Then the marker is `"%plugin-editor:view.editor%"`.

**Step 2: Add i18n to terminal plugin**

Same pattern. Create locale files:

`plugins/terminal/locales/en-US.json`:

```json
{
  "view.terminal": "Terminal"
}
```

`plugins/terminal/locales/zh-CN.json`:

```json
{
  "view.terminal": "终端"
}
```

In `plugins/terminal/index.tsx`, add `configI18n` with namespace `"plugin-terminal"`, update `name` to `"%plugin-terminal:view.terminal%"`.

**Step 3: Run checks**

Run: `bun check`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/plugins/editor/ \
       packages/desktop/src/renderer/src/plugins/terminal/
git commit -m "feat: add i18n setup and NLS markers for editor and terminal plugins"
```

---

### Task 6: Update content-panel-demo plugin

This is a dev-only demo plugin. No i18n setup needed — just leave plain strings (the hook returns non-markers as-is). No changes required here.

---

### Task 7: Clean up app-level locale files and update tests

**Files:**

- Modify: `packages/desktop/src/renderer/src/locales/en-US.json:305-308`
- Modify: `packages/desktop/src/renderer/src/locales/zh-CN.json:307-310`
- Modify: `packages/desktop/src/renderer/src/features/content-panel/__tests__/content-panel.test.ts`

**Step 1: Delete tab keys from app locales**

Remove from `locales/en-US.json`:

```json
"tab.Editor": "Editor",
"tab.Git Diff": "Git Diff",
"tab.Terminal": "Terminal",
"tab.Review": "Review",
```

Remove from `locales/zh-CN.json`:

```json
"tab.Editor": "编辑器",
"tab.Git Diff": "代码变更",
"tab.Terminal": "终端",
"tab.Review": "评审",
```

**Step 2: Update content-panel tests**

In `content-panel.test.ts`, the test fixture `VIEWS` uses `name: "Terminal"` and `name: "Editor"`. These are plain strings (not markers), which is fine — `ContentPanel` stores whatever `name` the view provides. No changes needed in test expectations since `content-panel.ts` just stores `view.name` as-is.

However, check test on line 65: `expect(...tabs[0].name).toBe("Terminal")`. If views are updated to use markers in a full integration test, this would change. But since unit tests use their own fixture `VIEWS` (not real plugins), **no test changes needed**.

**Step 3: Run full check**

Run: `bun ready`
Expected: PASS — format + typecheck + lint + tests all green

**Step 4: Commit**

```bash
git add packages/desktop/src/renderer/src/locales/en-US.json \
       packages/desktop/src/renderer/src/locales/zh-CN.json
git commit -m "chore: remove app-level tab.* i18n keys, now owned by plugins"
```
