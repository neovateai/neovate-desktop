# Streamdown Composition Refactor Design

**Goal:** Unify shared `Streamdown` behavior without introducing a monolithic wrapper component, and stop styling markdown through descendant `className` selectors.

**Decision:** Keep `Streamdown` at each usage site and share only two things:

- `packages/desktop/src/renderer/src/lib/markdown.ts`
- `packages/desktop/src/renderer/src/components/ai-elements/markdown-base-components.tsx`

**Core rule:** All shared foundational markdown node components belong in `markdown-base-components.tsx`.

**Non-goals:**

- No `AppMarkdown` or `MarkdownRenderer` wrapper
- No `styles.ts`
- No merge helper for component maps
- No markdown theming via `"[&_p]"`, `"[&_a]"`, `"[&_table]"`-style descendant selectors on `Streamdown`

## File Layout

### `packages/desktop/src/renderer/src/lib/markdown.ts`

Purpose:

- Hold non-JSX markdown configuration

Contents:

- `markdownPlugins`

Initial shape:

```ts
import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";

export const markdownPlugins = { cjk, code, math, mermaid };
```

Rules:

- No JSX
- No scene-specific class names
- No UI container concerns

### `packages/desktop/src/renderer/src/components/ai-elements/markdown-base-components.tsx`

Purpose:

- Hold shared JSX render overrides for markdown nodes

Contents:

- `markdownBaseComponents`

Initial scope:

- `p`
- `h1`
- `h2`
- `h3`
- `ul`
- `ol`
- `li`
- `a`
- `code`
- `table`
- `th`
- `td`
- `blockquote`
- `pre`

Rules:

- Own shared markdown node rendering and node styling
- All foundational markdown node components live here; usage sites should consume the exported map instead of redefining node-level renderers
- No message-only or reasoning-only layout concerns
- If a node override is only needed by one scene, keep it in that scene instead
- Prefer explicit JSX components over selector-driven styling on the parent `Streamdown`
- Do not create standalone named React components for trivial nodes like `p`, `h1`, `h2`, `h3`, `ul`, `ol`, `li`, `th`, or `td` unless they gain real logic
- Simple foundational nodes should stay as inline entries inside `markdownBaseComponents`
- Extract a named component only when the node has real behavior or structure, such as `a`, `code`, `pre`, `table`, or `blockquote`

Recommended structure:

```tsx
export function MarkdownLink(props: ComponentProps<"a">) { ... }
export function MarkdownInlineCode(props: ComponentProps<"code"> & ExtraProps) { ... }
export function MarkdownPre(props: ComponentProps<"pre">) { ... }
export function MarkdownBlockquote(props: ComponentProps<"blockquote">) { ... }
export function MarkdownTable(props: ComponentProps<"table">) { ... }

export const markdownBaseComponents: Components = {
  p: ({ children, ...props }) => <p {...props}>{children}</p>,
  h1: ({ children, ...props }) => <h1 {...props}>{children}</h1>,
  h2: ({ children, ...props }) => <h2 {...props}>{children}</h2>,
  h3: ({ children, ...props }) => <h3 {...props}>{children}</h3>,
  ul: ({ children, ...props }) => <ul {...props}>{children}</ul>,
  ol: ({ children, ...props }) => <ol {...props}>{children}</ol>,
  li: ({ children, ...props }) => <li {...props}>{children}</li>,
  a: MarkdownLink,
  code: MarkdownInlineCode,
  pre: MarkdownPre,
  blockquote: MarkdownBlockquote,
  table: MarkdownTable,
  th: ({ children, ...props }) => <th {...props}>{children}</th>,
  td: ({ children, ...props }) => <td {...props}>{children}</td>,
};
```

## Usage Pattern

Each scene composes `Streamdown` directly.
The `Streamdown` instance should not carry descendant-selector markdown styling.

### `MessageResponse`

```tsx
import { markdownBaseComponents } from "./markdown-base-components";
import { markdownPlugins } from "../../lib/markdown";

<Streamdown
  plugins={markdownPlugins}
  components={markdownBaseComponents}
  className={className}
  {...props}
/>;
```

### `ReasoningContent`

```tsx
import { markdownBaseComponents } from "./markdown-base-components";
import { markdownPlugins } from "../../lib/markdown";

<Streamdown plugins={markdownPlugins} components={markdownBaseComponents} className={className}>
  {children}
</Streamdown>;
```

Allowed `className` usage:

- outer layout hooks such as width or spacing of the `Streamdown` root itself
- scene container styling on `MessageContent` / `CollapsibleContent`

Disallowed `className` usage:

- styling markdown descendants through selectors like `"[&_p]"`, `"[&_code]"`, `"[&_table]"`, `"[&_blockquote]"`, `"[&_a]"`

## Why This Boundary

- `markdown.ts` is configuration, so it belongs in `lib`
- `markdown-base-components.tsx` is JSX render behavior, so it belongs next to other AI element components
- `MessageResponse` and `ReasoningContent` stay independently composable
- This removes selector-based markdown theming and moves node styling to explicit components
- This avoids hiding real scene differences behind a fake shared abstraction

## Implementation Steps

1. Create `packages/desktop/src/renderer/src/lib/markdown.ts` and export `markdownPlugins`.
2. Create `packages/desktop/src/renderer/src/components/ai-elements/markdown-base-components.tsx` and export `markdownBaseComponents`.
3. Add a focused test for `markdownBaseComponents` at `packages/desktop/src/renderer/src/components/ai-elements/__tests__/markdown-base-components.test.tsx`.
   Check links, tables, blockquotes, headings, lists, and inline code.
4. Update `packages/desktop/src/renderer/src/components/ai-elements/message.tsx` to use `markdownPlugins` and `markdownBaseComponents`.
   Remove markdown descendant selector styling from the `Streamdown` `className`.
5. Update `packages/desktop/src/renderer/src/components/ai-elements/reasoning.tsx` to use `markdownPlugins` and `markdownBaseComponents`.
   Do not reintroduce markdown descendant selector styling there.
6. Re-check `packages/desktop/src/renderer/src/features/agent/components/markdown-content.tsx`.
   If it is still unused, delete it.
   If it becomes used, convert it to the same composition pattern without introducing a wrapper component.

## Verification

Run:

```bash
bun test packages/desktop/src/renderer/src/components/ai-elements/__tests__/markdown-base-components.test.tsx
bun test packages/desktop/src/renderer/src/components/ai-elements/__tests__/message-response.test.tsx
bun test packages/desktop/src/renderer/src/components/ai-elements/__tests__/reasoning-content.test.tsx
bun run test:run
```

Manual check:

- Assistant message markdown still renders in the main chat
- Reasoning markdown still renders inside the collapsible
- Plan approval markdown still renders correctly
- Tool cards that display markdown still render links, tables, and code blocks
- No markdown appearance depends on `"[&_...]"` descendant selectors on `Streamdown`
