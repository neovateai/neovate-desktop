# Neo Desktop Design Specification

> A comprehensive design system for the Neo Desktop application.
> This document serves as the authoritative reference for all UI implementation.

---

## Table of Contents

1. [Design Philosophy](#1-design-philosophy)
2. [Color System](#2-color-system)
3. [Typography](#3-typography)
4. [Spacing & Layout](#4-spacing--layout)
5. [Component Library](#5-component-library)
6. [Animation & Motion](#6-animation--motion)
7. [Iconography](#7-iconography)
8. [Patterns & Templates](#8-patterns--templates)
9. [Accessibility](#9-accessibility)
10. [Implementation Guidelines](#10-implementation-guidelines)
11. [Message Input System](#11-message-input-system)
12. [AI Element Components](#12-ai-element-components)

---

## 1. Design Philosophy

### 1.1 Core Principles

| Principle | Description |
|-----------|-------------|
| **Quiet Confidence** | The UI should feel calm and authoritative. Avoid visual noise, excessive borders, and competing focal points. Let content breathe. |
| **Developer-First Density** | Respect screen real estate. Provide information density when developers need it (code, diffs, terminals) while keeping chat conversational and spacious. |
| **One Accent, Used Sparingly** | The brand color is used for primary actions and key interactive states only. Everything else stays neutral. |
| **Motion with Purpose** | Animations should orient and inform, never decorate. Use motion to help users track state changes. |
| **Consistent Primitives** | Build from the existing component library. Maintain consistent spacing, radius, and token usage across all features. |

### 1.2 Brand Personality

**Minimal, quiet, elegant.** Understated sophistication like iA Writer or Things. The hot pink primary provides a single bold accent against otherwise restrained, neutral surfaces.

### 1.3 Target Users

Professional developers who use AI-assisted coding tools daily. They value efficiency, speed, and control. The interface should evoke **confidence and focus** — never get in the way, always feel fast.

### 1.4 Visual References

- **Positive:** Claude/ChatGPT conversational AI interfaces — clean chat with clear message hierarchy, generous whitespace, readable markdown rendering.
- **Negative:** Overly decorative UIs, heavy gradients, gamified elements, neon/cyberpunk aesthetics.

---

## 2. Color System

### 2.1 Design Tokens

All colors are defined as CSS custom properties in `globals.css`. Use Tailwind utility classes that reference these tokens.

#### Core Semantic Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|------------|-----------|-------|
| `--primary` | `#b83b5e` | `#eb6b8e` | Brand accent, primary buttons, focus rings |
| `--primary-foreground` | `white` | `white` | Text on primary backgrounds |
| `--background` | `#f5f7fa` | `#0a0a0a` | Page background (cool gray-blue / near-black) |
| `--foreground` | `neutral-800` | `neutral-100` | Primary text |
| `--card` | `white` | `#1a1a1a` | Card/panel backgrounds |
| `--card-foreground` | `neutral-800` | `neutral-100` | Card text |
| `--muted` | `black/4%` | `white/6%` | Subtle backgrounds |
| `--muted-foreground` | `neutral-500/90%` | `neutral-500/90%` | Secondary text |
| `--accent` | `black/4%` | `white/6%` | Hover/active states |
| `--accent-foreground` | `neutral-800` | `neutral-100` | Text on accent |
| `--border` | `black/8%` | `white/8%` | Borders |
| `--input` | `black/10%` | `white/10%` | Input borders |
| `--ring` | `#b83b5e` | `#eb6b8e` | Focus rings |
| `--popover` | `white` | `#1e1e1e` | Popover backgrounds |
| `--secondary` | `#000000` | `#ffffff` | Secondary buttons |

#### Semantic Status Colors

| Token | Value | Usage |
|-------|-------|-------|
| `--destructive` | `red-500` | Destructive actions, errors |
| `--success` | `emerald-500` | Success states |
| `--warning` | `amber-500` | Warnings |
| `--info` | `blue-500` | Informational |
| `--skill` | `#751ed9` (light) / `#b06dff` (dark) | Skills/plugins |

#### Diff Colors

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--diff-added` | `#00a240` | `#00a240` | Added lines |
| `--diff-added-bg` | `#00a240/12%` | `#00a240/15%` | Added line backgrounds |
| `--diff-removed` | `#e02e2a` | `#e02e2a` | Removed lines |
| `--diff-removed-bg` | `#e02e2a/12%` | `#e02e2a/15%` | Removed line backgrounds |

### 2.2 Glass Morphism System

Neo Desktop uses a layered glass effect system for depth and hierarchy.

| Token | Light | Dark | Usage |
|-------|-------|------|-------|
| `--glass-tint` | `white` | `#1e1e1e` | Base tint color |
| `--glass-1` | `tint/72%` | `tint/72%` | Sidebar (most transparent) |
| `--glass-2` | `tint/80%` | `tint/80%` | Cards |
| `--glass-3` | `tint/88%` | `tint/88%` | Popovers |
| `--glass-4` | `tint/92%` | `tint/92%` | Dialogs (most opaque) |
| `--glass-blur-1` | `24px` | `24px` | Sidebar blur |
| `--glass-blur-2` | `16px` | `16px` | Card blur |
| `--glass-blur-3` | `12px` | `12px` | Popover blur |
| `--glass-blur-4` | `8px` | `8px` | Dialog blur |
| `--glass-border` | `black/6%` | `white/10%` | Glass element borders |
| `--glass-shadow` | `0 8px 32px -8px rgba(0,0,0,0.08)` | `0 8px 32px -8px rgba(0,0,0,0.4)` | Glass shadows |

**Utility Classes:**
```css
.glass-sidebar   /* --glass-1 + --glass-blur-1 */
.glass-card      /* --glass-2 + --glass-blur-2 */
.glass-popover   /* --glass-3 + --glass-blur-3 */
```

### 2.3 Theme Styles

Neo supports four theme styles, each with light/dark variants:

| Style | Primary (Light) | Primary (Dark) | Mood |
|-------|-----------------|----------------|------|
| **Default** | `#b83b5e` | `#eb6b8e` | Cool, professional |
| **Claude** | `#d87656` | `#e8a88a` | Warm, humanistic |
| **Codex** | `#10a37f` | `#19c37d` | Clean, tech (ChatGPT-like) |
| **Nord** | `#5e81ac` | `#88c0d0` | Nordic, aurora-inspired |

Theme is applied via `data-style` attribute on `<html>`:
```html
<html data-style="claude" class="dark">
```

---

## 3. Typography

### 3.1 Font Stack

```css
/* System font stack - no custom fonts loaded */
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

/* Monospace for code */
font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
```

### 3.2 Type Scale

| Class | Size | Line Height | Usage |
|-------|------|-------------|-------|
| `text-xs` | 12px | 16px | Captions, timestamps |
| `text-sm` | 14px | 20px | Body text, inputs |
| `text-base` | 16px | 24px | Large body (mobile default) |
| `text-lg` | 18px | 28px | Subheadings |
| `text-xl` | 20px | 28px | Dialog titles |
| `text-2xl` | 24px | 32px | Page headers |

**Responsive behavior:** Desktop uses `sm:text-sm` for most body text (14px), mobile uses `text-base` (16px).

### 3.3 Font Weights

| Weight | Class | Usage |
|--------|-------|-------|
| 400 | `font-normal` | Body text |
| 500 | `font-medium` | Buttons, labels |
| 600 | `font-semibold` | Headings |
| 700 | `font-bold` | Strong emphasis |

### 3.4 Heading Styles

```tsx
// Dialog Title
<DialogTitle className="font-heading font-semibold text-xl leading-none" />

// Card Title
<CardTitle className="font-heading font-semibold text-lg" />

// Section Header
<h2 className="font-medium text-sm text-muted-foreground" />
```

---

## 4. Spacing & Layout

### 4.1 Spacing Scale

Neo uses Tailwind's default spacing scale (1 unit = 4px):

| Token | Value | Common Usage |
|-------|-------|--------------|
| `0.5` | 2px | Micro gaps |
| `1` | 4px | Icon gaps, tight spacing |
| `1.5` | 6px | Button icon gaps |
| `2` | 8px | Component gaps, small padding |
| `2.5` | 10px | Button padding (small) |
| `3` | 12px | Button padding (default) |
| `3.5` | 14px | Message bubble padding |
| `4` | 16px | Card padding, section gaps |
| `6` | 24px | Dialog padding, large gaps |
| `8` | 32px | Page margins |

### 4.2 Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `0.625rem` (10px) | Global base radius |
| `rounded-sm` | 2px | Micro elements |
| `rounded-md` | 6px | Small buttons (xs, sm) |
| `rounded-lg` | 10px | Default buttons, inputs, cards |
| `rounded-xl` | 12px | Large cards |
| `rounded-2xl` | 16px | Dialogs, message bubbles |

**Computed radius pattern:**
```css
/* Account for border width */
before:rounded-[calc(var(--radius-lg)-1px)]
```

### 4.3 Application Layout

The app uses CSS Grid with 8 columns:

```
┌─────────────────────────────────────────────────────────┐
│                      Title Bar                          │
├──────┬─────┬──────────┬───────┬──────────┬──────┬──────┤
│ Pri  │ Sep │  Chat    │  Sep  │ Content  │ Sep  │ Act  │
│ Side │  1  │  Panel   │   2   │  Panel   │  3   │ Bar  │
│      │     │          │       │          │      │      │
└──────┴─────┴──────────┴───────┴──────────┴──────┴──────┘
```

**Layout Constants:**

| Constant | Value | Description |
|----------|-------|-------------|
| `APP_LAYOUT_CHAT_PANEL_MIN_WIDTH` | 340px | Minimum chat panel width |
| `APP_LAYOUT_ACTIVITY_BAR_WIDTH` | 40px | Right activity bar width |
| `APP_LAYOUT_EDGE_SPACING` | 8px | Window edge to sidebar |
| `APP_LAYOUT_RESIZE_HANDLE_WIDTH` | 5px | Draggable separator width |
| `APP_LAYOUT_COLLAPSED_TITLEBAR_LEFT_MARGIN` | 136px | Titlebar left margin when sidebar collapsed |

**Grid Template:**
```css
grid-template-columns: auto auto 1fr auto auto auto auto auto;
grid-template-rows: auto 1fr;
```

### 4.4 Panel System

| Panel | Default Width | Min | Max | Collapsible | Content |
|-------|---------------|-----|-----|-------------|---------|
| Primary Sidebar | 300px | 250px | 600px | Yes | Session list |
| Chat Panel | Flexible | 340px | ∞ | No | Conversation |
| Content Panel | 300px | 300px | ∞ | Yes (default) | Tabs (editor, terminal, etc.) |
| Secondary Sidebar | 240px | 240px | 600px | Yes (default) | Plugin views (files, etc.) |
| Activity Bar | 40px | 40px | 40px | No | Navigation icons |

#### 4.4.1 Panel Collapse/Expand Animation

```tsx
const SPRING = { type: "spring", stiffness: 600, damping: 49 };

<motion.aside
  animate={{ width: collapsed ? 0 : width }}
  transition={isResizing ? { duration: 0 } : SPRING}
/>
```

- During drag: `duration: 0` (instant feedback)
- Collapse/expand: Spring animation (600 stiffness, 49 damping)

#### 4.4.2 Panel Overflow Priority

When window shrinks, panels collapse in this priority order:

| Priority | Panel | Behavior |
|----------|-------|----------|
| 3 (first) | Chat Panel | Shrinks first to protect others |
| 2 | Content Panel | Acts as buffer to protect chat |
| 1 | Secondary Sidebar | Shrinks before primary |
| 0 (last) | Primary Sidebar | Protected, shrinks last |

#### 4.4.3 Resize Handle

**Visual feedback:**
```css
/* Radial gradient from mouse position */
bg-[radial-gradient(circle_66vh_at_50%_var(--y),
  color-mix(in oklch, var(--primary) calc(var(--intensity)*100%), transparent) 0%,
  color-mix(in oklch, var(--primary) calc(var(--intensity)*50%), transparent) 30%,
  transparent 70%)]
```

- Hover intensity: 50%
- Dragging intensity: 100%
- Gradient color: `--primary` (brand color)

#### 4.4.4 Panel State Persistence

- Storage: `localStorage` with key `neovate-layout`
- Persisted: Panel widths, collapsed states, active views
- Validation: Width clamped to min/max on restore
- Protection: Chat panel forced to never collapse

### 4.5 Conversation Layout

#### 4.5.1 Container Structure

```tsx
<Conversation>
  <ConversationContent className="max-w-3xl mx-auto px-4 py-3">
    {messages.map(message => (
      <MessageParts key={message.id} message={message} />
    ))}
  </ConversationContent>
  <ConversationScrollButton />
</Conversation>
```

#### 4.5.2 Specifications

| Property | Value |
|----------|-------|
| Max Width | `max-w-3xl` (768px) |
| Horizontal Padding | `px-4` (16px) |
| Vertical Padding | `py-3` (12px) |
| Message Gap | `gap-4` (16px) |
| Scroll Behavior | Stick to bottom (smooth) |

#### 4.5.3 Scroll Button

Position: `absolute bottom-4 left-[50%] translate-x-[-50%]`
Visibility: Only shown when not at bottom

---

## 5. Component Library

### 5.1 Overview

- **57 base components** in `components/ui/`
- **21 AI-specific components** in `components/ai-elements/`
- Built on **@base-ui/react** primitives
- Styled with **Tailwind CSS 4** + **CVA** (class-variance-authority)

### 5.2 Button

**Variants:**

| Variant | Description | Style |
|---------|-------------|-------|
| `default` | Primary action | Brand color background, white text |
| `secondary` | Secondary action | Black/white background |
| `outline` | Bordered | Transparent with border |
| `ghost` | Minimal | Transparent, accent on hover |
| `destructive` | Dangerous action | Red background |
| `destructive-outline` | Dangerous bordered | Red text, border on hover |
| `link` | Text link | Underline on hover |

**Sizes:**

| Size | Height | Icon Size | Usage |
|------|--------|-----------|-------|
| `xs` | 28px (24px sm) | 16px | Compact areas |
| `sm` | 32px (28px sm) | 16px | Secondary actions |
| `default` | 36px (32px sm) | 18px | Primary actions |
| `lg` | 40px (36px sm) | 18px | Prominent CTAs |
| `xl` | 44px (40px sm) | 20px | Hero buttons |
| `icon-xs` | 28px | 16px | Toolbar icons |
| `icon-sm` | 32px | 16px | Message actions |
| `icon` | 36px | 18px | Default icon buttons |
| `icon-lg` | 40px | 18px | Large icon buttons |
| `icon-xl` | 44px | 20px | Hero icon buttons |

**Usage:**
```tsx
import { Button } from "../components/ui/button";

<Button variant="default" size="default">Save</Button>
<Button variant="ghost" size="icon-sm"><CopyIcon /></Button>
```

### 5.3 Input

**Structure:** Dual-layer architecture (outer container + inner input)

```tsx
<span data-slot="input-control" className="...border styles...">
  <input data-slot="input" className="...text styles..." />
</span>
```

**Sizes:**

| Size | Height | Usage |
|------|--------|-------|
| `sm` | 30px (26px sm) | Compact forms |
| `default` | 34px (30px sm) | Standard forms |
| `lg` | 38px (34px sm) | Prominent inputs |

**States:**
- `focus-visible`: Ring + border color change
- `aria-invalid`: Destructive border + ring
- `disabled`: 64% opacity
- `autofill`: Subtle foreground background

### 5.4 Dialog

**Structure:**
```tsx
<Dialog>
  <DialogTrigger />
  <DialogPopup>              {/* Portal + backdrop + viewport */}
    <DialogHeader>
      <DialogTitle />
      <DialogDescription />
    </DialogHeader>
    <DialogPanel>            {/* ScrollArea wrapper */}
      {/* Content */}
    </DialogPanel>
    <DialogFooter>
      {/* Actions */}
    </DialogFooter>
  </DialogPopup>
</Dialog>
```

**Features:**
- Nested dialog support with stacking animation
- Mobile bottom-sheet behavior (`max-sm:` responsive)
- Glass morphism backdrop
- Auto close button

**Nested Dialog Animation:**
```css
scale-[calc(1-0.1*var(--nested-dialogs))]
opacity-[calc(1-0.1*var(--nested-dialogs))]
-translate-y-[calc(1.25rem*var(--nested-dialogs))]
```

### 5.5 Card

**Variants:**

| Component | Usage |
|-----------|-------|
| `Card` | Basic card container |
| `CardFrame` | Card with clip-path for nested content |
| `CardHeader` | Header with grid layout |
| `CardTitle` | Heading text |
| `CardDescription` | Subtext |
| `CardAction` | Top-right action slot |
| `CardPanel` | Main content area |
| `CardFooter` | Footer actions |

### 5.6 Message System (AI Elements)

The Message system is the core of the AI conversation interface. It handles multiple content types, streaming states, and interactive elements.

#### 5.6.1 Message Container Structure

```tsx
// User Message
<Message from="user">
  <MessageContent>
    <p className="m-0 whitespace-pre-wrap">{text}</p>
  </MessageContent>
</Message>

// Assistant Message
<Message from="assistant">
  <MessageContent>
    <MessageResponse>{markdownContent}</MessageResponse>
  </MessageContent>
  <MessageToolbar>
    <MessageActions>
      <MessageAction tooltip="Copy Markdown"><CopyIcon /></MessageAction>
    </MessageActions>
  </MessageToolbar>
</Message>
```

#### 5.6.2 Message Bubble Specifications

| Property | User Message | Assistant Message |
|----------|--------------|-------------------|
| Container Class | `is-user ml-auto justify-end max-w-[80%]` | `is-assistant max-w-full` |
| Content Alignment | Right (`ml-auto`) | Left (full width) |
| Max Width | 80% of container | 100% |
| Background | `bg-muted/60` | Transparent |
| Border Radius | `rounded-2xl rounded-tr-md` | None |
| Padding | `px-3.5 py-2` | None |
| Text Color | `text-foreground` | `text-foreground` |
| Font Size | `text-sm` | `text-sm` |
| Line Height | `leading-relaxed` | `leading-relaxed` |

#### 5.6.3 Message Part Types

Messages are composed of multiple parts, each rendered differently:

| Part Type | Renderer | Description |
|-----------|----------|-------------|
| `text` | `MessageResponse` | Markdown text (Streamdown) |
| `reasoning` | `Reasoning` | Collapsible thinking block |
| `file` (image) | `<img>` | Image attachment |
| `tool-*` | Tool components | 22 different tool types |
| `data-system/init` | Hidden | System initialization |
| `data-result/success` | Trailing content | Success result |
| `data-result/error` | Error display | Error message |

#### 5.6.4 Message Actions

Actions appear on hover for assistant messages:

```tsx
<MessageActions className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
  <MessageAction
    tooltip="Copy Markdown"
    size="icon-xs"
    variant="ghost"
  >
    {copied ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
  </MessageAction>
</MessageActions>
```

**Action Button Specifications:**
- Size: `icon-xs` (28px)
- Variant: `ghost`
- Icon Size: 12px
- Copy feedback: 2 second timeout

#### 5.6.5 Message Collapsing Logic

Assistant messages with multiple parts can be collapsed:

**Collapse Trigger Conditions:**
1. `restored` mode: Messages restored from history → auto-collapsed
2. `live` mode: Streaming completed with success result → collapse after 1 second

**Collapse UI:**
```tsx
<Collapsible open={isOpen} onOpenChange={setIsOpen}>
  <CollapsibleTrigger className="flex w-full items-center gap-2 text-sm text-muted-foreground">
    <ChevronDownIcon className={cn(
      "size-4 shrink-0 transition-transform duration-150",
      isOpen ? "rotate-0" : "-rotate-90"
    )} />
    <span>{triggerLabel}</span>  {/* e.g., "1 thought, 2 tool calls" */}
  </CollapsibleTrigger>
  <CollapsibleContent className="mt-2 text-muted-foreground/60">
    {/* Collapsed content */}
  </CollapsibleContent>
</Collapsible>
```

**Trigger Label Format:**
- Single: "1 thought" / "2 tool calls" / "1 message"
- Combined: "1 thought, 2 tool calls" (comma-separated)

#### 5.6.6 Reasoning Block

The Reasoning component shows Claude's thinking process:

**States:**
| State | Display | Auto-behavior |
|-------|---------|---------------|
| Streaming | `<Shimmer>Thinking...</Shimmer>` | Auto-open |
| Completed | "Thought for X seconds" | Auto-close after 1s |
| Collapsed | Duration text | Stays collapsed |

**Specifications:**
```tsx
<Reasoning isStreaming={part.state === "streaming"}>
  <ReasoningTrigger className="italic text-muted-foreground" />
  <ReasoningContent className="text-muted-foreground">
    <Streamdown>{text}</Streamdown>
  </ReasoningContent>
</Reasoning>
```

**Animation:**
- Auto-open delay: 0ms (immediate on stream start)
- Auto-close delay: 1000ms (after stream ends)
- Height transition: 200ms with `[0.4, 0, 0.2, 1]` easing

### 5.7 Tool Call System

Neo supports 22 tool types, each with specific UI patterns.

#### 5.7.1 Tool Container Structure

```tsx
<Tool>
  <ToolHeader
    title="Read /path/to/file.ts"
    type="tool-Read"
    state="output-available"  // or "input-streaming", "output-error"
  />
  <ToolContent>
    {/* Tool-specific content */}
  </ToolContent>
</Tool>
```

#### 5.7.2 Tool States

| State | Icon | Description |
|-------|------|-------------|
| `input-streaming` | Animated | Tool is receiving input |
| `output-available` | Static | Tool completed successfully |
| `output-error` | Red dot | Tool encountered an error |

#### 5.7.3 Tool Icon Mapping

All tool icons use `text-muted-foreground` color:

| Tool Type | Icon | Lucide Name |
|-----------|------|-------------|
| Read | 📄 | `FileText` |
| Write | ➕ | `FilePlus` |
| Edit | ✏️ | `FileEdit` |
| MultiEdit | 📚 | `Files` |
| Bash | 💻 | `Terminal` |
| Glob | 🔍 | `Search` |
| Grep | `.*` | `Regex` |
| WebSearch | 🌐 | `Globe` |
| WebFetch | ⬇️ | `Download` |
| Agent | 🤖 | `Bot` |
| Task | ✓ | `ListChecks` |

#### 5.7.4 Tool Content Patterns

**Code Output (Read, Bash, Grep):**
```tsx
<ToolContent>
  <CodeBlock
    code={output}
    language={language}
    className="text-sm"
  />
</ToolContent>
```

**Diff Output (Edit, MultiEdit):**
```tsx
<ToolContent>
  <MultiFileDiff
    oldFile={{ name: fileName, contents: oldString }}
    newFile={{ name: fileName, contents: newString }}
    options={{
      theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
      diffStyle: "unified",
    }}
  />
</ToolContent>
```

**Error Output:**
```tsx
<div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10">
  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-destructive" />
  <span className="text-sm text-destructive-foreground">{errorText}</span>
</div>
```

#### 5.7.5 Tool Expand/Collapse Animation

```tsx
<AnimatePresence initial={false}>
  {state.open && (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{
        height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
        opacity: { duration: 0.12 },
      }}
      className="overflow-hidden"
    >
      {children}
    </motion.div>
  )}
</AnimatePresence>
```

### 5.8 Code Block Component

#### 5.8.1 Structure

```tsx
<CodeBlockContainer language="typescript">
  <CodeBlockHeader>
    <CodeBlockTitle>{filename}</CodeBlockTitle>
    <CodeBlockActions>
      <CodeBlockCopyButton />
      <CodeBlockLanguageSelector />
    </CodeBlockActions>
  </CodeBlockHeader>
  <CodeBlockContent
    code={code}
    language={language}
    showLineNumbers={true}
  />
</CodeBlockContainer>
```

#### 5.8.2 Specifications

| Element | Style |
|---------|-------|
| Container | `rounded-lg bg-muted/40 overflow-hidden` |
| Header | `flex items-center justify-between bg-muted/30 px-3 py-1.5` |
| Title | `text-xs text-muted-foreground font-mono` |
| Content | `overflow-auto text-sm font-mono` |
| Line Numbers | `text-right text-muted-foreground/50 select-none pr-4` |

#### 5.8.3 Syntax Highlighting

- **Engine:** Shiki (async loading)
- **Themes:** `github-dark` (dark mode), `github-light` (light mode)
- **Caching:** Three-layer cache (highlighter, tokens, subscribers)
- **Dark mode:** CSS variables `var(--shiki-dark)`, `var(--shiki-dark-bg)`

#### 5.8.4 Copy Button States

| State | Icon | Duration |
|-------|------|----------|
| Default | `CopyIcon` | - |
| Copied | `CheckIcon` | 2000ms timeout |

### 5.9 Markdown Rendering

#### 5.9.1 Component Mapping

| Element | Class | Notes |
|---------|-------|-------|
| `<h1>` | `mt-6 mb-4 text-base font-semibold first:mt-0` | - |
| `<h2>` | `mt-5 mb-3 text-sm font-semibold first:mt-0` | - |
| `<h3-h6>` | Decreasing sizes | h6 uses `uppercase tracking-wide` |
| `<p>` | `my-4 text-sm leading-relaxed first:mt-0 last:mb-0` | - |
| `<ul>` | `my-4 list-disc space-y-1 pl-5` | - |
| `<ol>` | `my-4 list-decimal space-y-1 pl-5` | - |
| `<li>` | `text-sm leading-relaxed marker:text-muted-foreground` | - |
| `<code>` inline | `inline-block rounded-md bg-muted/50 px-1.5 py-0.5 text-xs` | - |
| `<pre>` | Uses CodeBlock component | - |
| `<blockquote>` | `pl-4 text-sm italic text-muted-foreground` | - |
| `<table>` | `w-full border-collapse text-sm my-4` | Wrapped in `overflow-x-auto` |
| `<th>` | `bg-muted/40 px-3 py-2 text-left font-medium border-b` | - |
| `<td>` | `border-b border-border/50 px-3 py-2` | - |
| `<a>` | `text-primary underline-offset-2 hover:underline` | Opens via app opener |
| `<img>` | `my-4 max-w-full rounded-md loading="lazy"` | - |
| `<input checkbox>` | `mr-2 size-3.5 accent-primary` | - |

### 5.10 Complete Component List

**Form & Input:**
`input`, `textarea`, `checkbox`, `radio-group`, `switch`, `select`, `input-group`, `field`, `fieldset`, `number-field`, `slider`, `combobox`, `autocomplete`

**Dialog & Overlay:**
`dialog`, `alert-dialog`, `popover`, `menu`, `context-menu`, `sheet`, `tooltip`, `hover-card`, `toast`

**Container & Layout:**
`card`, `frame`, `group`, `scroll-area`, `table`, `sidebar`, `toolbar`, `accordion`, `collapsible`, `tabs`

**Display:**
`button`, `badge`, `avatar`, `label`, `separator`, `kbd`, `spinner`, `skeleton`, `breadcrumb`, `pagination`, `progress`, `meter`, `empty`, `preview-card`, `alert`

**Navigation:**
`tabs`, `pagination`, `breadcrumb`, `command`

---

## 6. Animation & Motion

### 6.1 Motion Library

Use `motion/react` (not `framer-motion`):
```tsx
import { motion, AnimatePresence } from "motion/react";
```

### 6.2 Spring Configurations

| Config | Stiffness | Damping | Usage |
|--------|-----------|---------|-------|
| **Standard** | 600 | 49 | Panel width, sidebar collapse |
| **Fast** | 360 | 34 | Small element displacement |
| **Smooth** | 300 | 30 | Icon transitions |

```tsx
// Standard spring for panels
const SPRING = { type: "spring", stiffness: 600, damping: 49 };

<motion.aside
  animate={{ width: collapsed ? 0 : width }}
  transition={isResizing ? { duration: 0 } : SPRING}
/>
```

### 6.3 Duration Guidelines

| Duration | Usage |
|----------|-------|
| 0ms | During drag/resize |
| 150ms | Micro-interactions (fade, scale) |
| 200ms | Standard transitions |
| 300ms | Loading state changes |
| 2000ms | Shimmer/skeleton loop |

### 6.4 Easing Functions

| Easing | CSS | Usage |
|--------|-----|-------|
| ease-in-out | `ease-in-out` | Standard transitions |
| custom | `[0.4, 0, 0.2, 1]` | Height animations |
| linear | `linear` | Skeleton/shimmer loops |

### 6.5 Common Animation Patterns

**Fade + Scale (Attachments, list items):**
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  exit={{ opacity: 0, scale: 0.8 }}
  transition={{ duration: 0.15 }}
/>
```

**Height Collapse (Accordion, collapsible):**
```tsx
<motion.div
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: "auto", opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{
    height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
    opacity: { duration: 0.12 },
  }}
/>
```

**Shimmer (Loading text):**
```tsx
<motion.span
  animate={{ backgroundPosition: "0% center" }}
  initial={{ backgroundPosition: "100% center" }}
  transition={{
    duration: 2,
    ease: "linear",
    repeat: Infinity,
  }}
/>
```

### 6.6 Tailwind Animation Classes

| Class | Usage |
|-------|-------|
| `animate-spin` | Loading spinners |
| `animate-pulse` | Thinking indicator |
| `animate-skeleton` | Skeleton loading |
| `transition-opacity` | Fade effects |
| `transition-colors` | Color changes |
| `transition-all` | General transitions |
| `duration-200` | Standard duration |
| `ease-in-out` | Standard easing |

---

## 7. Iconography

### 7.1 Icon Libraries

| Library | Package | Usage |
|---------|---------|-------|
| **Lucide** | `lucide-react` | General UI icons |
| **Hugeicons** | `@hugeicons/core-free-icons` | Sidebar/plugin icons |
| **Seti** | `@antfu/seti-icons` | File type icons |

### 7.2 Icon Sizes

| Size | Pixels | Usage |
|------|--------|-------|
| `size-3` | 12px | Inline, micro |
| `size-3.5` | 14px | Small buttons (xs/sm) |
| `size-4` | 16px | Default body level |
| `size-4.5` | 18px | Default buttons |
| `size-5` | 20px | Large buttons |
| `size-6` | 24px | Headers |

### 7.3 Icon Styling

```tsx
// Default icon opacity in buttons
[&_svg:not([class*='opacity-'])]:opacity-80

// Lucide icon usage
import { CopyIcon, CheckIcon } from "lucide-react";
<CopyIcon className="size-4" />

// Hugeicons usage
import { HugeiconsIcon } from "@hugeicons/react";
import { PanelLeftIcon } from "@hugeicons/core-free-icons";
<HugeiconsIcon icon={PanelLeftIcon} size={20} strokeWidth={1.5} />
```

---

## 8. Patterns & Templates

### 8.1 Session List Item

```tsx
<div className={cn(
  "group relative px-2 py-1.5 rounded-md cursor-pointer",
  "hover:bg-accent",
  isActive && "bg-accent",
)}>
  {/* Title */}
  <span className="truncate text-sm">{title}</span>

  {/* Metadata */}
  <span className="text-xs text-muted-foreground">
    {formatRelativeTime(createdAt)}
  </span>

  {/* Hover actions */}
  <div className="opacity-0 group-hover:opacity-100 transition-opacity">
    <MoreActionsMenu />
  </div>
</div>
```

### 8.2 Tab Bar Item

```tsx
<button className={cn(
  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm",
  "hover:bg-accent transition-colors",
  isActive && "bg-accent text-foreground",
  !isActive && "text-muted-foreground",
)}>
  <FileIcon className="size-4" />
  <span className="truncate max-w-32">{title}</span>
  <button
    onClick={handleClose}
    className="opacity-0 group-hover:opacity-100 ml-1"
  >
    <XIcon className="size-3" />
  </button>
</button>
```

### 8.3 Empty State

```tsx
<div className="flex size-full flex-col items-center justify-center gap-3 p-8 text-center">
  <div className="text-muted-foreground">
    <EmptyIcon className="size-10" />
  </div>
  <div className="space-y-1">
    <h3 className="font-medium text-sm">{title}</h3>
    <p className="text-sm text-muted-foreground">{description}</p>
  </div>
</div>
```

### 8.4 Loading State

```tsx
// Spinner
<Spinner className="size-4" />

// Query Status (streaming)
<div className="flex items-center gap-1.5 px-3 py-1 text-xs">
  <span className="font-mono">{spinnerFrame}</span>
  <span className="text-muted-foreground">
    {verb}... <span className="animate-pulse">thinking...</span>
  </span>
</div>

// Skeleton
<div className="animate-skeleton bg-muted rounded h-4 w-full" />
```

### 8.5 Form Field

```tsx
<Field>
  <Label>Email</Label>
  <Input type="email" placeholder="you@example.com" />
  <FieldDescription>We'll never share your email.</FieldDescription>
  <FieldError />
</Field>
```

### 8.6 Confirmation Dialog

```tsx
<AlertDialog>
  <AlertDialogTrigger>
    <Button variant="destructive">Delete</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction>Delete</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

---

## 9. Accessibility

### 9.1 Focus Management

**Focus Ring:**
```css
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background
```

**Focus within containers:**
```css
has-focus-visible:ring-[3px] has-focus-visible:border-ring
```

### 9.2 Touch Targets

Minimum touch target size: 44x44px on touch devices
```css
pointer-coarse:after:absolute pointer-coarse:after:size-full pointer-coarse:after:min-h-11 pointer-coarse:after:min-w-11
```

### 9.3 Screen Reader Support

```tsx
// Hidden label
<span className="sr-only">Close</span>

// ARIA labels
<button aria-label="Close dialog">
  <XIcon />
</button>

// Role and status
<Spinner role="status" aria-label="Loading" />
```

### 9.4 Keyboard Navigation

- All interactive elements are keyboard accessible
- Focus visible states are always shown for keyboard navigation
- Tab order follows logical reading order
- Escape closes modals/popovers

### 9.5 Color Contrast

- Text on primary: white on `#b83b5e` (WCAG AA compliant)
- Body text: `neutral-800` on `#f5f7fa` (high contrast)
- Muted text: `neutral-500` on backgrounds (use sparingly)

---

## 10. Implementation Guidelines

### 10.1 File Organization

```
src/renderer/src/
├── components/
│   ├── ui/              # Base components (shadcn-generated)
│   ├── ai-elements/     # AI-specific components
│   └── app-layout/      # Layout components
├── features/
│   └── <feature>/
│       ├── components/  # Feature-specific components
│       └── store.ts     # Zustand store
├── plugins/
│   └── <plugin>/
│       └── *-view.tsx   # Plugin views
└── assets/
    └── globals.css      # Theme & global styles
```

### 10.2 Component Creation Checklist

- [ ] Use existing `components/ui/` primitives when possible
- [ ] Follow `data-slot` naming convention for CSS targeting
- [ ] Include `className` prop with `cn()` utility
- [ ] Support dark mode via CSS variables
- [ ] Add keyboard accessibility
- [ ] Include ARIA labels for non-text content
- [ ] Use responsive breakpoints (`sm:` for desktop)

### 10.3 Styling Best Practices

```tsx
// DO: Use semantic color tokens
className="text-foreground bg-background"

// DON'T: Use raw color values
className="text-gray-900 bg-gray-100"

// DO: Use cn() for conditional classes
className={cn("base-class", isActive && "active-class")}

// DON'T: String concatenation
className={`base-class ${isActive ? "active-class" : ""}`}

// DO: Use CVA for variants
const buttonVariants = cva("base", { variants: { ... } });

// DON'T: Multiple conditional ternaries
className={`${size === "sm" ? "h-8" : size === "lg" ? "h-12" : "h-10"}`}
```

### 10.4 State Management

```tsx
// Zustand store pattern
export const useFeatureStore = create<State>()(
  immer((set, get) => ({
    data: [],

    // Optimistic updates
    addItem: (item) => {
      set((state) => { state.data.push(item); });
      client.feature.addItem(item); // Fire-and-forget
    },

    // Async with loading
    loadData: async () => {
      const data = await client.feature.getData();
      set((state) => { state.data = data; });
    },
  }))
);
```

### 10.5 Import Guidelines

```tsx
// UI Components - relative imports
import { Button } from "../components/ui/button";
import { Input } from "../../components/ui/input";

// oRPC Client
import { client } from "../../orpc";

// DO NOT import from main process
// import { something } from "../../main/..."; // ERROR!
```

### 10.6 Testing Considerations

- Components should work without JavaScript (progressive enhancement)
- Test with keyboard-only navigation
- Test in both light and dark modes
- Verify touch targets on mobile
- Check loading and error states

---

## 11. Message Input System

### 11.1 Input Container Structure

```tsx
<MessageInput>
  <AttachmentPreview />           {/* Image thumbnails */}
  <PlanModeIndicator />           {/* Optional: Plan mode banner */}
  <GradientBorderWrapper>
    <EditorContent editor={editor} />  {/* Tiptap editor */}
  </GradientBorderWrapper>
  <InputToolbar />                {/* Actions and send button */}
  <QueryStatus />                 {/* Streaming status */}
</MessageInput>
```

### 11.2 Editor Configuration

**Tiptap with minimal formatting:**
- StarterKit with all formatting disabled (no bold, italic, lists, etc.)
- Placeholder extension
- Custom extensions: Mention, SlashCommand, ImagePaste, ChatKeymap

**Editor Styles:**
```css
.tiptap {
  min-height: 76px;
  max-height: 240px;
  overflow-y: auto;
  padding: 0.5rem;
  font-size: text-sm (14px);
  outline: none;
  background: var(--background-secondary);
}
```

### 11.3 @Mention System

**Trigger:** Type `@` to search files in current working directory

**Behavior:**
1. Debounce 100ms before search
2. Search via IPC: `client.utils.searchPaths`
3. Max 15 results
4. Directory selection re-triggers search (drill-down)
5. File selection inserts mention node + space

**Suggestion List:**
```tsx
<div className="border bg-popover rounded-t-lg shadow-md max-h-[300px]">
  <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b">
    Files
  </div>
  <div className="p-1 overflow-y-auto">
    {items.map(item => (
      <button className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        isSelected && "bg-accent"
      )}>
        <FileIcon /> or <FolderIcon />
        <span>{item.title}</span>
        <span className="text-xs text-muted-foreground truncate">{item.description}</span>
      </button>
    ))}
  </div>
</div>
```

**Mention Node Styling (in editor):**
```css
.tiptap .mention {
  background: --alpha(var(--primary) / 15%);
  color: var(--primary);
  border-radius: 0.25rem;
  padding: 0.125rem 0.25rem;
  font-size: 0.875rem;
  font-weight: 500;
}
```

### 11.4 Slash Commands

**Trigger:** Type `/` at the start of a line

**Slash Command Node Styling:**
```css
.tiptap .slash-command {
  background: --alpha(var(--success) / 15%);
  color: var(--success-foreground);
  border-radius: 0.25rem;
  padding: 0.125rem 0.375rem;
  font-size: 0.875em;
  font-weight: 500;
}
```

### 11.5 Keyboard Shortcuts

| Shortcut | Action | Condition |
|----------|--------|-----------|
| `Tab` | Accept prompt suggestion | Editor empty + suggestion exists |
| `Enter` | Send message | Default mode, no popup open |
| `Cmd/Ctrl+Enter` | Send or newline | Based on user setting |
| `Alt+Enter` | Insert newline | Always |
| `Shift+Tab` | Toggle plan mode | Always |
| `Escape` | Clear suggestion / blur | Progressive |
| `↑/↓` | Navigate suggestions | Popup open |

### 11.6 Attachment Preview

**Thumbnail Grid:**
```tsx
<AnimatePresence>
  {attachments.map(att => (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ duration: 0.15 }}
      className="group relative"
    >
      <img
        src={`data:${att.mediaType};base64,${att.base64}`}
        className="h-14 w-14 rounded-md object-cover"
      />
      <button className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-destructive opacity-0 group-hover:opacity-100">
        <XIcon className="h-3 w-3" />
      </button>
    </motion.div>
  ))}
</AnimatePresence>
```

### 11.7 Input Toolbar States

**Send Button States:**

| State | Appearance | Action |
|-------|------------|--------|
| Ready | Primary button, ArrowUp icon | Send message |
| Streaming | Muted button, Square icon, pulse border | Stop generation |
| Error | Muted button, RotateCw icon | Retry |
| Initializing | Muted background, Spinner | Wait |
| Disabled | Muted, 40% opacity | None |

**Button Specifications:**
```tsx
// Send button (ready)
<button className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/85 active:scale-95">
  <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
</button>

// Stop button (streaming)
<button className="relative flex h-7 w-7 items-center justify-center rounded-full bg-foreground/10 text-foreground hover:bg-foreground/15 active:scale-95">
  <span className="absolute inset-0 rounded-full border border-foreground/20 animate-pulse" />
  <Square className="h-2.5 w-2.5 fill-current" />
</button>
```

### 11.8 Query Status Display

**Status Phases:**
| Phase | Display | Transition |
|-------|---------|------------|
| `idle` | Invisible (space reserved) | - |
| `active` | Spinner + verb + elapsed time | On message send |
| `completing` | Fade out (opacity-0) | 2.5s after completion |

**Spinner Animation:**
```tsx
const SPINNER_FRAMES = ["·", "✢", "✳", "✶", "✻", "✽"];
// Ping-pong: 10 frames, ~200ms per frame
```

**Status Text Format:**
```
⟳ Thinking… (12s · thought for 3s)
```

### 11.9 Plan Mode Indicator

```tsx
<motion.div
  initial={{ height: 0, opacity: 0 }}
  animate={{ height: "auto", opacity: 1 }}
  exit={{ height: 0, opacity: 0 }}
  transition={{ duration: 0.15 }}
>
  <div className="flex items-center gap-1.5 border-b border-info/20 bg-info/5 px-3 py-1 text-xs text-info-foreground">
    <span className="font-medium">Plan Mode</span>
    <span className="text-info-foreground/50">Shift+Tab to exit</span>
  </div>
</motion.div>
```

### 11.10 Gradient Border Wrapper

The input container uses a sophisticated gradient border:

```tsx
<div
  className="rounded-[12px] shadow-[0_4px_4px_rgba(0,0,0,0.04)]"
  style={{
    border: "3px solid transparent",
    background: `
      linear-gradient(var(--color-background), var(--color-background)) padding-box,
      linear-gradient(180deg, var(--color-background) 0%,
        color-mix(in srgb, var(--color-background) 50%, transparent) 100%) border-box
    `,
  }}
>
  <div
    className="overflow-hidden rounded-lg focus-within:!border-primary/50"
    style={{
      border: "2px solid transparent",
      transition: "border-color 0.2s",
      background: `
        linear-gradient(var(--background-secondary)) padding-box,
        linear-gradient(0deg, color-mix(in srgb, var(--primary) 30%, transparent) 0,
          transparent 80%) border-box
      `,
    }}
  >
    {children}
  </div>
</div>
```

---

## 12. AI Element Components

### 12.1 Shimmer Loading

**Purpose:** Animated text placeholder during streaming

```tsx
<Shimmer duration={1}>Thinking...</Shimmer>
```

**Implementation:**
- CSS background gradient sweep
- Direction: 100% → 0% (right to left)
- Duration: 2s per cycle (configurable)
- Spread: Dynamic based on text length

**Styles:**
```css
background-clip: text;
color: transparent;
background-size: 250% 100%;
background-image:
  var(--bg),  /* sweep gradient */
  linear-gradient(var(--foreground), var(--foreground));
```

### 12.2 Terminal Component

**Design:** Dark theme terminal emulator

```tsx
<Terminal>
  <TerminalHeader>
    <span className="text-zinc-400">Terminal</span>
    <Badge variant="outline">{status}</Badge>
    <TerminalCopyButton />
    <TerminalClearButton />
  </TerminalHeader>
  <TerminalContent>
    {/* ANSI-rendered output */}
  </TerminalContent>
</Terminal>
```

**Specifications:**
| Element | Style |
|---------|-------|
| Background | `bg-zinc-950` |
| Text | `text-zinc-100` |
| Border | `border-zinc-800` |
| Max Height | `max-h-96` (384px) |
| Font | Monospace |

**Features:**
- ANSI color rendering (via `ansi-to-react`)
- Auto-scroll to bottom
- Streaming cursor: `animate-pulse`

### 12.3 Attachments Component

**Three Layout Modes:**

| Mode | Container | Item Size | Use Case |
|------|-----------|-----------|----------|
| `grid` | `flex flex-wrap gap-2` | 96×96px | Image gallery |
| `inline` | `flex h-8 gap-1.5 rounded-md bg-muted/50 px-1.5` | 20×20px | Compact list |
| `list` | `flex w-full gap-3 rounded-lg bg-muted/30 p-3` | Full width | Detailed view |

### 12.4 Context (Token Usage)

**Progress Circle:**
- SVG-based circular progress
- Background: `opacity: 0.25`
- Progress: `opacity: 0.7`, dashed stroke
- Rotation: -90° (starts at top)

**Token Display:**
```tsx
<ContextHeader>
  <ContextProgressRing value={percentage} />
  <span>{percentage}%</span>
</ContextHeader>
<ContextBody>
  <span>Input: {inputTokens}</span>
  <span>Output: {outputTokens}</span>
  <span>Cache: {cachedTokens}</span>
</ContextBody>
<ContextFooter>
  <span>Total: ${cost.toFixed(4)}</span>
</ContextFooter>
```

### 12.5 Chain of Thought

**Step Status Styles:**
```tsx
const stepStatusStyles = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  pending: "text-muted-foreground/50",
};
```

**Animation:**
- Enter: `fade-in-0 slide-in-from-top-2 animate-in`
- Exit: `slide-out-to-top-2 animate-out`

### 12.6 Inline Citation

**Hover Badge:**
```tsx
<span className="inline-flex items-center gap-0.5 rounded bg-muted/50 px-1.5 py-0.5 text-xs">
  {hostname}
  {sources.length > 1 && <span>+{sources.length - 1}</span>}
</span>
```

**Carousel Navigation:**
- Embla Carousel integration
- Keyboard shortcuts: Left/Right arrows
- Index display: `1/3`

---

## Appendix A: CSS Variable Reference

```css
/* Copy this to get all available variables */
:root {
  /* Layout */
  --radius: 0.625rem;

  /* Base Colors */
  --background: #f5f7fa;
  --foreground: var(--color-neutral-800);
  --card: var(--color-white);
  --card-foreground: var(--color-neutral-800);
  --popover: var(--color-white);
  --popover-foreground: var(--color-neutral-800);

  /* Interactive */
  --primary: #b83b5e;
  --primary-foreground: var(--color-white);
  --secondary: #000000;
  --secondary-foreground: #ffffff;
  --muted: --alpha(var(--color-black) / 4%);
  --muted-foreground: var(--color-neutral-500);
  --accent: --alpha(var(--color-black) / 4%);
  --accent-foreground: var(--color-neutral-800);

  /* Semantic */
  --destructive: var(--color-red-500);
  --success: var(--color-emerald-500);
  --warning: var(--color-amber-500);
  --info: var(--color-blue-500);
  --skill: #751ed9;

  /* Borders & Rings */
  --border: --alpha(var(--color-black) / 8%);
  --input: --alpha(var(--color-black) / 10%);
  --ring: #b83b5e;

  /* Glass */
  --glass-tint: var(--color-white);
  --glass-1 through --glass-4;
  --glass-blur-1 through --glass-blur-4;
  --glass-border;
  --glass-shadow;

  /* Diff */
  --diff-added;
  --diff-removed;
  --diff-added-bg;
  --diff-removed-bg;
}
```

---

## Appendix B: Tailwind Class Cheatsheet

### Common Patterns

```css
/* Card */
rounded-2xl border bg-card text-card-foreground shadow-xs/5

/* Input Container */
rounded-lg border border-input bg-background shadow-xs/5 ring-ring/24

/* Button (default) */
rounded-lg border border-primary bg-primary text-primary-foreground shadow-xs

/* Ghost Button */
border-transparent text-foreground hover:bg-accent

/* Focus Ring */
focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1

/* Disabled */
disabled:pointer-events-none disabled:opacity-64

/* Hover Reveal */
opacity-0 group-hover:opacity-100 transition-opacity

/* Truncate */
truncate /* or */ line-clamp-2

/* Glass Card */
glass-card border rounded-lg
```

---

---

## Appendix C: File Reference

### Core Style Files

| File | Purpose |
|------|---------|
| `src/renderer/src/assets/globals.css` | Theme system, CSS variables, glass morphism |
| `src/renderer/src/assets/main.css` | Import aggregation |
| `src/renderer/src/assets/seti.css` | File type icons |
| `src/renderer/src/lib/utils.ts` | `cn()` utility function |

### Component Files

| Directory | Contents |
|-----------|----------|
| `components/ui/` | 57 base components (shadcn-generated) |
| `components/ai-elements/` | 21 AI-specific components |
| `components/app-layout/` | Layout system components |
| `features/agent/components/` | Chat and message components |
| `features/content-panel/components/` | Tab system |
| `plugins/*/` | Plugin-specific views |

### Key Component Files

| Component | File |
|-----------|------|
| Button | `components/ui/button.tsx` |
| Input | `components/ui/input.tsx` |
| Dialog | `components/ui/dialog.tsx` |
| Card | `components/ui/card.tsx` |
| Message | `components/ai-elements/message.tsx` |
| CodeBlock | `components/ai-elements/code-block.tsx` |
| Tool | `components/ai-elements/tool.tsx` |
| Reasoning | `components/ai-elements/reasoning.tsx` |
| MessageInput | `features/agent/components/message-input.tsx` |
| MessageParts | `features/agent/components/message-parts.tsx` |

---

*Last updated: 2026-03-30*
*Version: 2.0.0*
