# Design Doc: Decouple ToolHeader into Composable Primitives

**Date:** 2026-04-09
**Status:** Ready for implementation

## Problem

`ToolHeader` in `components/ai-elements/tool.tsx` has an **encode-then-decode anti-pattern**:

1. Specific tools (ReadTool, EditTool, etc.) have structured data (`filePath`, `actionName`)
2. They serialize it into a `title` string: `"Read /foo/bar.ts"`
3. `ToolHeader` re-parses that string with regex (`parseToolTitle`) to extract the path back out

Additionally, `ToolHeader` owns a 22-entry `toolIconMap` that maps tool names to Lucide icons — all with identical `"text-muted-foreground"` color.

### Issues

- **Fragile regex** — `extractFilePath` misfires on URLs (WebFetch), slash commands (Skill `/commit`)
- **Redundant round-trip** — structured data → string → regex → structured data
- **Accidental correctness** — EditTool has `"Edit  /path"` (double space), works by luck
- **Central registry coupling** — adding a new tool requires editing `toolIconMap` in a generic component

## Design: Composable Primitives

4 components. `Tool` accepts `state` and `errorText` at the root, provides them via context. Child components read state as needed.

### Components

```tsx
// 1. Tool — root container, accepts state + errorText, provides context
export const Tool = ({
  state,
  errorText,
  className,
  ...props
}: ToolProps & { state: ToolState; errorText?: string }) => (
  <ToolContext.Provider value={{ state, errorText }}>
    <Collapsible
      className={cn("group/tool not-prose w-full overflow-hidden rounded-md", className)}
      {...props}
    />
  </ToolContext.Provider>
);

// 2. ToolHeader — CollapsibleTrigger, reads state for text color
export function ToolHeader({ children, className }: { children: ReactNode; className?: string }) {
  const { state } = useToolContext();
  return (
    <CollapsibleTrigger
      className={cn(
        "inline-flex gap-2 w-max shrink-0 items-center text-sm cursor-pointer",
        state === "output-error" ? "text-destructive" : "text-foreground",
        className,
      )}
      style={{ width: "max-content" }}
    >
      {children}
    </CollapsibleTrigger>
  );
}

// 3. ToolHeaderIcon — icon ↔ chevron hover swap, reads state for icon color
export function ToolHeaderIcon({ icon: Icon }: { icon: React.FC<LucideProps> }) {
  const { state } = useToolContext();
  const iconColor = state === "output-error" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="relative flex size-3 shrink-0 items-center justify-center">
      <Icon className={cn("absolute size-3 transition-opacity duration-150 group-hover/tool:opacity-0", iconColor)} />
      <ChevronDown className="absolute size-3 -rotate-90 text-muted-foreground opacity-0 transition-all duration-150 group-hover/tool:opacity-100 group-data-[open]/tool:rotate-0" />
    </div>
  );
}

// 4. ToolContent — animated panel, auto-renders errorText from context before children
export const ToolContent = ({ className, children }: { className?: string; children?: ReactNode }) => {
  const { state, errorText } = useToolContext();
  return (
    <CollapsiblePanel keepMounted render={...}>
      {/* AnimatePresence + motion.div */}
      <div className={cn("space-y-2 text-popover-foreground", className)}>
        {state === "output-error" && errorText && (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{errorText}</span>
          </div>
        )}
        {children}
      </div>
    </CollapsiblePanel>
  );
};
```

### State flow

```
Tool (state="output-error", errorText="File not found")
  └─ ToolContext.Provider value={{ state, errorText }}
       ├─ ToolHeader          ← text-destructive
       │    ├─ ToolHeaderIcon  ← icon turns red
       │    └─ "Read xxx"      ← inherits red from ToolHeader
       └─ ToolContent          ← auto-renders errorText before children
```

### What gets deleted

| Code                                 | Reason                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| `toolIconMap` (22 entries)           | Each tool imports its own icon                              |
| `getToolIconInfo()`                  | No longer needed                                            |
| `getFileName()`                      | Not a Tool concern                                          |
| `extractFilePath()`                  | No more regex parsing                                       |
| `parseToolTitle()`                   | No more title parsing                                       |
| `StatusDot`                          | Replaced by state-driven color in ToolHeader/ToolHeaderIcon |
| `ToolHeader` (current smart version) | Replaced by composable primitives                           |
| Error UI in individual tools         | Unified in ToolContent                                      |

### What stays in tool.tsx

- `Tool` — enhanced with `state` + `errorText` props, context provider
- `ToolHeader` — thin `CollapsibleTrigger`, state-aware text color
- `ToolHeaderIcon` — icon ↔ chevron swap, state-aware icon color
- `ToolContent` — animated panel, auto-renders error text
- `ToolInput` / `ToolOutput` — unchanged (separate concern)

## Migration Examples

### File-operation tools (Read, Edit, Write, MultiEdit, NotebookEdit)

```tsx
// before
<Tool>
  <ToolHeader type="tool-Read" state={state} title={`Read ${filePath}`} />
  <ToolContent>
    {hasError && errorText ? (
      <div className="flex items-start gap-2 ...">
        <AlertCircle ... />
        <span>{errorText}</span>
      </div>
    ) : (
      <CodeBlock ... />
    )}
  </ToolContent>
</Tool>

// after — error UI removed, handled by ToolContent
<Tool state={state} errorText={errorText}>
  <div className="flex items-center gap-1">
    <ToolHeader>
      <ToolHeaderIcon icon={FileText} />
      Read {fileName}
    </ToolHeader>
    <OpenInEditorButton filePath={filePath} />
  </div>
  <ToolContent>
    {code && <CodeBlock ... />}
  </ToolContent>
</Tool>
```

### Search tools (Glob, Grep)

```tsx
// before
<Tool>
  <ToolHeader type="tool-Glob" state={state} title={`Glob for "${pattern}" in ${path}`} />
  <ToolContent>...</ToolContent>
</Tool>

// after
<Tool state={state}>
  <ToolHeader>
    <ToolHeaderIcon icon={Search} />
    Glob for "{input.pattern}" in {input.path}
  </ToolHeader>
  <ToolContent>...</ToolContent>
</Tool>
```

### Simple tools (EnterPlanMode, ExitPlanMode, TaskStop, etc.)

```tsx
// before
<Tool>
  <ToolHeader type="tool-EnterPlanMode" state={state} title="Enter Plan Mode" />
  <ToolContent>...</ToolContent>
</Tool>

// after
<Tool state={state}>
  <ToolHeader>
    <ToolHeaderIcon icon={Map} />
    Enter Plan Mode
  </ToolHeader>
  <ToolContent>...</ToolContent>
</Tool>
```

### Text-title tools (Bash, Agent, WebSearch, Skill)

```tsx
// before
<Tool>
  <ToolHeader type="tool-Bash" state={state} title={input?.description} />
  <ToolContent>...</ToolContent>
</Tool>

// after
<Tool state={state}>
  <ToolHeader>
    <ToolHeaderIcon icon={Terminal} />
    {input?.description ?? "Bash"}
  </ToolHeader>
  <ToolContent>...</ToolContent>
</Tool>
```

## Impact

### Files changed

| File                              | Change                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `components/ai-elements/tool.tsx` | Add state/errorText context to Tool, replace ToolHeader with composable primitives, delete parsing/icon-map/StatusDot, add error rendering to ToolContent |
| All 21 `tool-parts/*.tsx`         | Pass state/errorText to Tool, import own icon, compose with ToolHeader/ToolHeaderIcon, remove per-tool error UI                                           |

### Risk

Low — pure UI refactor. Error display is unified and improved (previously some tools had no error UI at all). No new dependencies.
