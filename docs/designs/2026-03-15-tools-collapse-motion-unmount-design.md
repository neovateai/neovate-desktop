# Tools Collapse: Motion-Driven Animation Design

## 1. Background

Tool cards in long conversations with heavy content (Read/Edit/MultiEdit/Bash with syntax-highlighted code blocks) experienced jank during expand/collapse. The root cause was CSS `height` transitions triggering per-frame layout reflow across the entire message list.

## 2. Problem Analysis

### Previous Implementation

- `CollapsiblePanel` (Base UI) with CSS `transition-[height] duration-200`
- Base UI measured content height via `--collapsible-panel-height` CSS variable
- Every frame during transition: browser recalculated layout for the panel and repainted all child content (thousands of Shiki syntax highlight `<span>` elements)

### Approaches Evaluated

| Approach                               | Result                                      |
| -------------------------------------- | ------------------------------------------- |
| CSS `visibility: hidden` during close  | Content disappears instantly — bad UX       |
| Opacity fadeout + height animation     | GPU layer creation itself causes frame drop |
| Shorter close duration (`duration-75`) | Still perceptible jank                      |
| Instant close (`duration-0`)           | No jank, but loses animation entirely       |
| **Motion library (`AnimatePresence`)** | **Smooth animation, no jank**               |

### Reference Implementations

- **Craft Agents**: Uses `motion/react` with `AnimatePresence + motion.div` for tool card expand/collapse in chat. Conditional rendering — content unmounts after exit animation.
- **OpenCode**: SolidJS with `motion` imperative `animate()` API. Content stays mounted, height animated imperatively. `animated` mode exists but not used in message list.

## 3. Final Design

Replace CSS height transitions with `motion` library animations for tool card expand/collapse.

### Architecture

```
Tool (Collapsible.Root)          — state management + data-open attribute
  ToolHeader (CollapsibleTrigger) — click handling + accessibility
  ToolContent (CollapsiblePanel)  — render prop reads state → AnimatePresence + motion.div
```

### Key Decisions

1. **Motion over CSS transitions**: `motion` handles `height: "auto"` natively via JS measurement + rAF scheduling, avoiding the per-frame layout reflow that CSS `transition-[height]` causes.

2. **CollapsiblePanel with `render` prop**: Read `state.open` from Base UI's internal context via the `render` callback. No separate `useState` or custom context needed.

3. **`keepMounted={true}` on Panel**: Required so the `render` callback continues executing when closed, allowing `AnimatePresence` to complete its exit animation before unmounting content.

4. **`AnimatePresence initial={false}`**: Skip enter animation on first mount — tool cards should appear instantly when the message stream renders, only animate on user interaction.

5. **Content-visibility override in tools**: Code blocks use `content-visibility: auto` for scroll performance. Inside tool cards, this is overridden to `visible` via CSS custom property (`--code-block-content-visibility: visible`) to ensure motion measures the correct content height.

### ToolContent Implementation

```tsx
export const ToolContent = ({ className, children }: ToolContentProps) => (
  <CollapsiblePanel
    keepMounted
    render={(_panelProps, state) => (
      <AnimatePresence initial={false}>
        {state.open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.25, ease: [0.4, 0, 0.2, 1] },
              opacity: { duration: 0.15 },
            }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "border-t border-border/50 space-y-3 p-3 text-popover-foreground [--code-block-content-visibility:visible]",
                className,
              )}
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    )}
  />
);
```

### Animation Parameters

- **Height**: 250ms with Material Design standard easing `[0.4, 0, 0.2, 1]`
- **Opacity**: 150ms (completes before height, making close feel snappier)
- **Enter**: height 0→auto + opacity 0→1
- **Exit**: height→0 + opacity→0, then `AnimatePresence` unmounts content

### Code Block Optimization

`CodeBlockContainer` uses CSS custom properties for `content-visibility` and `contain-intrinsic-size`:

```tsx
"[contain-intrinsic-size:var(--code-block-contain-intrinsic-size,auto_200px)]";
"[content-visibility:var(--code-block-content-visibility,auto)]";
```

- Default (`auto`): Browser skips rendering off-screen code blocks — improves scroll performance
- Inside tool cards: Overridden to `visible` so motion measures actual height, not the 200px placeholder
- No performance loss: collapsed tool content is unmounted by AnimatePresence anyway

## 4. Files Changed

- `components/ai-elements/tool.tsx` — `ToolContent` uses `motion` instead of CSS transition
- `components/ai-elements/code-block.tsx` — `content-visibility` via CSS custom properties (overridable)
- `components/ui/collapsible.tsx` — Export cleanup, remove hardcoded `keepMounted` default

## 5. Verification

### Manual Checklist

1. All tools animate smoothly on expand/collapse — no jank
2. Rapid toggle 10-20 times — no flicker, no console errors
3. Heavy content tools (Read/Bash with long output) — smooth animation
4. Streaming output during expand/collapse — no content corruption
5. `defaultOpen` tools (AskUserQuestion, Agent) — appear instantly on mount, animate on toggle
