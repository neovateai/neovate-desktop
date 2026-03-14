# Neovate Desktop AI Message 视觉交互设计规范 v3.0

## 设计目标

- **整体协调**：所有元素大小、间距、颜色和谐统一
- **整齐渲染**：严格的网格对齐，避免错行乱行
- **清晰层次**：信息优先级通过视觉层级明确传达
- **优雅简洁**：去除冗余装饰，保持界面清爽

---

## 1. 整体布局系统

### 1.1 容器约束

| 属性 | 值 | 说明 |
|------|-----|------|
| 最大宽度 | `max-w-3xl` (768px) | 限制内容区域宽度，保证阅读舒适度 |
| 居中布局 | `mx-auto` | 消息内容居中，两侧留白呼吸 |
| 容器内边距 | `px-4 py-4` | 四方向统一 16px |
| 消息组间距 | `gap-5` (20px) | AI ↔ User 之间间距 |
| 同组消息间距 | `gap-1.5` (6px) | 同一角色的连续消息 |

### 1.2 对齐网格

所有元素基于 4px 网格对齐：
- 所有间距、内边距为 4 的倍数
- 行高计算确保文字基线对齐
- 代码块、表格等独立区域保持一致的内边距

---

## 2. 图标系统 (HugeIcons)

### 2.1 安装与导入

```bash
bun add @hugeicons/react @hugeicons/core-free-icons
```

```tsx
import { IconNameIcon } from "@hugeicons/react";
```

### 2.2 Tool 类型与图标映射

| Tool 类型 | HugeIcon | 颜色 | 说明 |
|-----------|----------|------|------|
| Read | `File02Icon` | `text-blue-500` | 读取文件 |
| Write | `FileAddIcon` | `text-emerald-500` | 写入文件 |
| Edit | `FileEditIcon` | `text-amber-500` | 编辑文件 |
| MultiEdit | `Copy01Icon` | `text-orange-500` | 批量编辑 |
| NotebookEdit | `BookOpen01Icon` | `text-violet-500` | Notebook 编辑 |
| Bash | `TerminalBrowserIcon` | `text-slate-500` | 终端命令 |
| Glob | `Search01Icon` | `text-cyan-500` | 文件搜索 |
| Grep | `TextWrapIcon` | `text-indigo-500` | 内容搜索 |
| WebSearch | `Globe02Icon` | `text-sky-500` | 网络搜索 |
| WebFetch | `Download04Icon` | `text-teal-500` | 网页获取 |
| AskUserQuestion | `HelpCircleIcon` | `text-pink-500` | 询问用户 |
| TodoWrite | `Task01Icon` | `text-emerald-600` | 任务管理 |
| Task | `Layers01Icon` | `text-orange-400` | 子任务 |
| TaskOutput | `ClipboardIcon` | `text-rose-500` | 任务输出 |
| TaskStop | `SquareIcon` | `text-red-500` | 停止任务 |
| Agent | `AiChat02Icon` | `text-primary` | Agent 调用 |
| Skill | `MagicWand01Icon` | `text-fuchsia-500` | Skill 调用 |
| EnterPlanMode | `RoadmapIcon` | `text-blue-400` | 进入计划模式 |
| ExitPlanMode | `Logout01Icon` | `text-gray-400` | 退出计划模式 |
| EnterWorktree | `GitBranchIcon` | `text-orange-400` | 进入工作区 |

### 2.3 通用图标

| 用途 | HugeIcon | 尺寸 |
|------|----------|------|
| 复制 | `Copy01Icon` | `size-3.5` |
| 复制成功 | `Tick02Icon` | `size-3.5` |
| 展开/折叠 | `ArrowDown01Icon` | `size-3` |
| 代码 | `CodeIcon` | `size-4` |
| 图片 | `Image01Icon` | `size-4` |
| 链接 | `Link01Icon` | `size-3.5` |
| 书籍/来源 | `BookOpen01Icon` | `size-4` |
| 思考 | `BrainIcon` | `size-4` |
| 滚动到底部 | `ArrowDown01Icon` | `size-4` |

---

## 3. Tool 消息设计

### 3.1 整体结构

```
┌────────────────────────────────────────────────────────┐
│ [icon] Action text · filename.ext              [●]    │  ← Header (折叠)
├────────────────────────────────────────────────────────┤
│ INPUT                                                  │  ← Content (展开)
│ ─────────────────────────────────────────────────────  │
│ {                                                      │
│   "key": "value"                                       │
│ }                                                      │
│ OUTPUT                                                 │
│ ─────────────────────────────────────────────────────  │
│ result text                                            │
└────────────────────────────────────────────────────────┘
```

### 3.2 Header 设计（单行高度 28px）

| 属性 | 值 | 说明 |
|------|-----|------|
| 高度 | `h-7` (28px) | 严格单行 |
| 内边距 | `px-2` | 左右 8px |
| 圆角 | `rounded-md` | 8px |
| 元素间距 | `gap-2` | Icon ↔ 文字 ↔ 状态点 |

#### Header 元素结构

```
[Icon size-4] [gap-2] [Action名称] [· 间隔符] [文件名] [flex-1] [状态点 size-1.5]
     ↑                                              ↑              ↑
   工具色                                      截断省略...      状态色
```

#### Header 代码实现

```tsx
<CollapsibleTrigger
  className={cn(
    "flex w-full items-center gap-2 h-7 px-2 rounded-md",
    "transition-colors duration-150",
    "hover:bg-muted/50 cursor-pointer group/tool"
  )}
>
  {/* Icon */}
  <ToolIcon
    className={cn("size-4 shrink-0", iconColor)}
    variant="solid"
  />

  {/* Label Area */}
  <span className="flex items-center gap-1.5 text-sm min-w-0">
    {/* Action Name - 粗体主文字 */}
    <span className="font-medium text-foreground shrink-0">
      {actionName}
    </span>

    {/* Separator - 中点间隔符 */}
    {actionName && displayName && (
      <span className="text-muted-foreground/40">·</span>
    )}

    {/* File Name - 灰色副文字，可截断 */}
    {displayName && (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-muted-foreground truncate">
            {displayName}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          <p className="text-xs">{fullPath}</p>
        </TooltipContent>
      </Tooltip>
    )}
  </span>

  {/* Spacer */}
  <span className="flex-1" />

  {/* Expand Indicator - 仅 hover 显示 */}
  <ArrowDown01Icon
    className="size-3 text-muted-foreground/50 opacity-0 group-hover/tool:opacity-100 transition-opacity duration-150 shrink-0"
  />

  {/* Status Dot - 静态，无动画 */}
  <span className={cn(
    "size-1.5 rounded-full shrink-0",
    statusColor
  )} />
</CollapsibleTrigger>
```

### 3.3 状态指示器（静态）

```tsx
const statusColors = {
  running: "bg-primary",
  success: "bg-emerald-500",
  error: "bg-red-500",
  pending: "bg-amber-500",
  cancelled: "bg-gray-400",
};
```

**原则**：
- 纯色圆点，无脉冲动画
- 尺寸固定 `size-1.5`
- 颜色与工具图标颜色体系独立

### 3.4 Content 设计

#### 展开动画

```tsx
<CollapsibleContent
  className={cn(
    "border-t border-border/40 overflow-hidden",
    "data-[state=closed]:animate-out data-[state=open]:animate-in",
    "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
    "data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1"
  )}
>
```

#### Input/Output 区块

```tsx
<div className="p-3 space-y-3">
  {/* Input */}
  <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Input
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
    <div className="rounded-md border border-border/50 bg-muted/30 overflow-hidden">
      <CodeBlock
        code={JSON.stringify(input, null, 2)}
        language="json"
        variant="compact"
      />
    </div>
  </div>

  {/* Output */}
  <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      <span className={cn(
        "text-[11px] font-semibold uppercase tracking-wider",
        errorText ? "text-red-500" : "text-muted-foreground"
      )}>
        {errorText ? "Error" : "Output"}
      </span>
      <div className="flex-1 h-px bg-border/40" />
    </div>
    <div className={cn(
      "rounded-md border overflow-hidden",
      errorText
        ? "border-red-200 bg-red-50 dark:border-red-900/30 dark:bg-red-900/10"
        : "border-border/50 bg-background"
    )}>
      {content}
    </div>
  </div>
</div>
```

---

## 4. Markdown 渲染规范

### 4.1 基础排版（与系统协调）

| 属性 | 值 | 说明 |
|------|-----|------|
| 字体大小 | `text-sm` (14px) | 与系统默认一致 |
| 行高 | `leading-6` (24px) | 四线网格对齐 |
| 字间距 | 默认 | 不额外调整 |
| 段落间距 | `mb-3` (12px) | 四的倍数 |

### 4.2 段落

```tsx
"text-sm leading-6 text-foreground",
"[&>p]:mb-3 [&>p:last-child]:mb-0"
```

### 4.3 标题层级

| 级别 | 大小 | 字重 | 上边距 | 下边距 |
|------|------|------|--------|--------|
| H1 | `text-lg` (18px) | `font-semibold` | `mt-6` | `mb-3` |
| H2 | `text-base` (16px) | `font-semibold` | `mt-5` | `mb-2.5` |
| H3 | `text-sm` (14px) | `font-semibold` | `mt-4` | `mb-2` |
| H4 | `text-sm` (14px) | `font-medium` | `mt-3` | `mb-2` |

```tsx
"[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3 [&_h1]:text-foreground",
"[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2.5 [&_h2]:text-foreground",
"[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2 [&_h3]:text-foreground",
"[&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-muted-foreground"
```

### 4.4 行内代码

```tsx
"[&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:rounded",
"[&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5",
"[&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-xs",
"[&_code:not(pre_code)]:text-foreground/90"
```

- 背景：`bg-muted`（与系统一致）
- 圆角：`rounded`（4px）
- 内边距：`px-1 py-0.5`
- 字体：12px mono

### 4.5 代码块（严格对齐）

#### 容器

```tsx
<div className="my-3 rounded-lg border border-border/50 overflow-hidden">
```

#### Header

```tsx
<div className={cn(
  "flex items-center justify-between h-8 px-3",
  "bg-muted/60 border-b border-border/50"
)}>
  {/* Left: Language + Filename */}
  <div className="flex items-center gap-2 min-w-0">
    <CodeIcon className="size-4 text-muted-foreground shrink-0" variant="solid" />
    <span className="text-xs text-muted-foreground shrink-0">
      {language}
    </span>
    {filename && (
      <>
        <span className="text-muted-foreground/30">·</span>
        <span className="text-xs text-foreground truncate">
          {filename}
        </span>
      </>
    )}
  </div>

  {/* Right: Copy */}
  <Button size="icon-xs" variant="ghost" className="size-6 shrink-0">
    <Copy01Icon className="size-3.5" />
  </Button>
</div>
```

#### Content

```tsx
<pre className={cn(
  "bg-muted/20 p-3 m-0 overflow-x-auto",
  "text-xs leading-5 font-mono"
)}>
  <code>{code}</code>
</pre>
```

**关键对齐点**：
- Header 高度固定 `h-8` (32px)
- Content 内边距 `p-3` (12px)
- 代码行高 `leading-5` (20px)，确保每行高度一致

### 4.6 列表（对齐关键）

#### 无序列表

```tsx
"[&_ul]:list-none [&_ul]:pl-0 [&_ul]:my-3",
"[&_ul]:space-y-1",  // 紧凑列表项间距

// 列表项 - 使用 flex 确保对齐
"[&_ul>li]:flex [&_ul>li]:items-start [&_ul>li]:gap-2",
"[&_ul>li]:before:content-[''] [&_ul>li]:before:w-1 [&_ul>li]:before:h-1",
"[&_ul>li]:before:rounded-full [&_ul>li]:before:bg-muted-foreground/50",
"[&_ul>li]:before:mt-2.5 [&_ul>li]:before:shrink-0"  // 圆点垂直居中对齐文字
```

#### 有序列表

```tsx
"[&_ol]:list-none [&_ol]:pl-0 [&_ol]:my-3",
"[&_ol]:space-y-1",

// 使用 CSS counter
"[&_ol]:counter-reset-list-item",
"[&_ol>li]:flex [&_ol>li]:items-start [&_ol>li]:gap-2",
"[&_ol>li]:before:content-[counter(list-item)] [&_ol>li]:before:counter-increment-list-item",
"[&_ol>li]:before:text-xs [&_ol>li]:before:text-muted-foreground/70",
"[&_ol>li]:before:min-w-[1.25rem] [&_ol>li]:before:text-right",
"[&_ol>li]:before:shrink-0"
```

### 4.7 引用块

```tsx
"[&_blockquote]:border-l-2 [&_blockquote]:border-primary/20",
"[&_blockquote]:pl-3 [&_blockquote]:py-0.5 [&_blockquote]:my-3",
"[&_blockquote]:text-muted-foreground",
"[&_blockquote]:bg-muted/30 [&_blockquote]:rounded-r-md [&_blockquote]:pr-3"
```

### 4.8 链接

```tsx
"[&_a]:text-primary [&_a]:font-medium",
"[&_a]:underline [&_a]:underline-offset-2",
"[&_a]:decoration-primary/30",
"[&_a]:hover:decoration-primary"
```

### 4.9 表格（严格对齐）

```tsx
// 容器 - 带边框和圆角
"[&_table]:block [&_table]:my-3 [&_table]:overflow-hidden",
"[&_table]:rounded-lg [&_table]:border [&_table]:border-border/50",

// 表头
"[&_thead]:bg-muted/50",
"[&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
"[&_th]:text-xs [&_th]:text-muted-foreground [&_th]:uppercase [&_th]:tracking-wider",
"[&_th]:border-b [&_th]:border-border/50",

// 单元格
"[&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_td]:text-foreground",
"[&_td]:border-b [&_td]:border-border/30",
"[&_tr:last-child_td]:border-b-0"
```

### 4.10 水平分隔线

```tsx
"[&_hr]:my-4 [&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-border/60"
```

### 4.11 图片

```tsx
"[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
"[&_img]:my-3 [&_img]:border [&_img]:border-border/50"
```

---

## 5. 用户消息设计

### 5.1 气泡样式

| 属性 | 值 |
|------|-----|
| 对齐 | 右对齐 `ml-auto` |
| 背景 | `bg-secondary` |
| 文字颜色 | `text-secondary-foreground` |
| 圆角 | `rounded-2xl rounded-tr-sm` |
| 内边距 | `px-4 py-2` |
| 最大宽度 | `max-w-[80%]` |

### 5.2 结构代码

```tsx
<Message from="user" className="max-w-[80%] ml-auto">
  <MessageContent className={cn(
    "rounded-2xl rounded-tr-sm px-4 py-2",
    "bg-secondary text-secondary-foreground"
  )}>
    <p className="text-sm leading-6">{content}</p>
  </MessageContent>
</Message>
```

---

## 6. Reasoning (思考过程)

### 6.1 容器

```tsx
<Reasoning className="w-full border border-border/40 rounded-lg overflow-hidden">
```

### 6.2 Trigger

```tsx
<ReasoningTrigger className={cn(
  "flex items-center gap-2 h-7 px-2",
  "text-sm text-muted-foreground",
  "transition-colors duration-150",
  "hover:bg-muted/50 hover:text-foreground"
)}>
  <BrainIcon className="size-4 shrink-0" variant="solid" />
  <span className="flex-1">
    {isStreaming ? "Thinking..." : `Thought for ${duration}s`}
  </span>
  <ArrowDown01Icon className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-180" />
</ReasoningTrigger>
```

### 6.3 Content

```tsx
<ReasoningContent className={cn(
  "border-t border-border/40 px-3 py-2",
  "text-sm text-muted-foreground leading-6",
  "bg-muted/20"
)}>
  {content}
</ReasoningContent>
```

---

## 7. 间距系统（4px 网格）

```
1 = 4px    (xs)
1.5 = 6px  (sm)
2 = 8px    (md)
2.5 = 10px
3 = 12px   (lg)
4 = 16px   (xl)
5 = 20px   (2xl)
6 = 24px   (3xl)
```

### 7.1 使用规范

| 场景 | 值 |
|------|-----|
| 图标与文字间距 | `gap-1.5` (6px) |
| 相关元素间距 | `gap-2` (8px) |
| 段落内边距 | `p-3` (12px) |
| 容器内边距 | `px-4` (16px) |
| 消息组间距 | `gap-5` (20px) |
| 区块间距 | `my-3` (12px) |

---

## 8. 颜色使用规范

### 8.1 主要颜色

| 用途 | 类名 |
|------|------|
| 主要文字 | `text-foreground` |
| 次要文字 | `text-muted-foreground` |
| 微弱背景 | `bg-muted/30` |
| Hover 背景 | `bg-muted/50` |
| 边框 | `border-border/50` |
| 链接 | `text-primary` |

### 8.2 状态颜色

| 状态 | 颜色 |
|------|------|
| 运行中 | `bg-primary` |
| 成功 | `bg-emerald-500` |
| 错误 | `bg-red-500` |
| 警告 | `bg-amber-500` |
| 取消 | `bg-gray-400` |

---

## 9. 组件实现代码

### 9.1 完整 Markdown 样式合并

```tsx
// packages/desktop/src/renderer/src/components/ai-elements/message.tsx

const messageMarkdownStyles = cn(
  // 基础
  "text-sm leading-6 text-foreground",
  "[&>p]:mb-3 [&>p:last-child]:mb-0",

  // 标题
  "[&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-6 [&_h1]:mb-3",
  "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-5 [&_h2]:mb-2.5",
  "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-4 [&_h3]:mb-2",
  "[&_h4]:text-sm [&_h4]:font-medium [&_h4]:mt-3 [&_h4]:mb-2 [&_h4]:text-muted-foreground",

  // 行内代码
  "[&_code:not(pre_code)]:bg-muted [&_code:not(pre_code)]:rounded",
  "[&_code:not(pre_code)]:px-1 [&_code:not(pre_code)]:py-0.5",
  "[&_code:not(pre_code)]:font-mono [&_code:not(pre_code)]:text-xs",

  // 无序列表 - flex 对齐
  "[&_ul]:list-none [&_ul]:pl-0 [&_ul]:my-3 [&_ul]:space-y-1",
  "[&_ul>li]:flex [&_ul>li]:items-start [&_ul>li]:gap-2",
  "[&_ul>li]:before:content-[''] [&_ul>li]:before:w-1 [&_ul>li]:before:h-1",
  "[&_ul>li]:before:rounded-full [&_ul>li]:before:bg-muted-foreground/50",
  "[&_ul>li]:before:mt-2.5 [&_ul>li]:before:shrink-0",

  // 有序列表
  "[&_ol]:list-none [&_ol]:pl-0 [&_ol]:my-3 [&_ol]:space-y-1",
  "[&_ol]:counter-reset-list-item",
  "[&_ol>li]:flex [&_ol>li]:items-start [&_ol>li]:gap-2",
  "[&_ol>li]:before:content-[counter(list-item)] [&_ol>li]:before:counter-increment-list-item",
  "[&_ol>li]:before:text-xs [&_ol>li]:before:text-muted-foreground/70",
  "[&_ol>li]:before:min-w-[1.25rem] [&_ol>li]:before:text-right [&_ol>li]:before:shrink-0",

  // 引用块
  "[&_blockquote]:border-l-2 [&_blockquote]:border-primary/20",
  "[&_blockquote]:pl-3 [&_blockquote]:py-0.5 [&_blockquote]:my-3",
  "[&_blockquote]:text-muted-foreground [&_blockquote]:bg-muted/30",
  "[&_blockquote]:rounded-r-md [&_blockquote]:pr-3",

  // 链接
  "[&_a]:text-primary [&_a]:font-medium",
  "[&_a]:underline [&_a]:underline-offset-2",
  "[&_a]:decoration-primary/30",
  "[&_a]:hover:decoration-primary",

  // 表格
  "[&_table]:block [&_table]:my-3 [&_table]:overflow-hidden",
  "[&_table]:rounded-lg [&_table]:border [&_table]:border-border/50",
  "[&_thead]:bg-muted/50",
  "[&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold",
  "[&_th]:text-xs [&_th]:text-muted-foreground [&_th]:uppercase [&_th]:tracking-wider",
  "[&_th]:border-b [&_th]:border-border/50",
  "[&_td]:px-3 [&_td]:py-2 [&_td]:text-sm [&_td]:text-foreground",
  "[&_td]:border-b [&_td]:border-border/30",
  "[&_tr:last-child_td]:border-b-0",

  // 分隔线
  "[&_hr]:my-4 [&_hr]:border-0 [&_hr]:h-px [&_hr]:bg-border/60",

  // 图片
  "[&_img]:max-w-full [&_img]:h-auto [&_img]:rounded-lg",
  "[&_img]:my-3 [&_img]:border [&_img]:border-border/50"
);
```

### 9.2 Tool Header 完整实现

```tsx
// packages/desktop/src/renderer/src/components/ai-elements/tool.tsx

const statusColorMap: Record<ToolState, string> = {
  "approval-requested": "bg-amber-500",
  "approval-responded": "bg-blue-500",
  "input-available": "bg-primary",
  "input-streaming": "bg-primary",
  "output-available": "bg-emerald-500",
  "output-denied": "bg-orange-500",
  "output-error": "bg-red-500",
};

export const ToolHeader = ({
  title,
  type,
  state,
  toolName,
  className,
  ...props
}: ToolHeaderProps) => {
  const derivedName = type === "dynamic-tool" ? toolName : type.split("-").slice(1).join("-");
  const { actionName, displayName, fullPath } = parseToolTitle(title ?? derivedName);
  const { icon: ToolIcon, color: iconColor } = getToolIcon(derivedName);
  const statusColor = statusColorMap[state] || "bg-muted-foreground";

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center gap-2 h-7 px-2 rounded-md",
        "transition-colors duration-150",
        "hover:bg-muted/50 cursor-pointer group/tool",
        className
      )}
      {...props}
    >
      <ToolIcon className={cn("size-4 shrink-0", iconColor)} variant="solid" />

      <span className="flex items-center gap-1.5 text-sm min-w-0">
        {actionName && (
          <span className="font-medium text-foreground shrink-0">{actionName}</span>
        )}
        {actionName && displayName && (
          <span className="text-muted-foreground/40">·</span>
        )}
        {displayName && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-muted-foreground truncate">{displayName}</span>
            </TooltipTrigger>
            <TooltipContent side="top" align="start">
              <p className="text-xs">{fullPath}</p>
            </TooltipContent>
          </Tooltip>
        )}
      </span>

      <span className="flex-1" />

      <ArrowDown01Icon
        className="size-3 text-muted-foreground/50 opacity-0 group-hover/tool:opacity-100 transition-opacity duration-150 shrink-0"
      />

      <span className={cn("size-1.5 rounded-full shrink-0", statusColor)} />
    </CollapsibleTrigger>
  );
};
```

---

## 10. 设计原则

1. **网格对齐**：所有间距、尺寸基于 4px 网格
2. **严格行高**：确保文字基线对齐，不错行
3. **协调统一**：Message、Tool、Markdown 使用一致的视觉语言
4. **静态优雅**：状态指示去除动画，保持静态优雅
5. **信息层次**：通过字重、颜色深浅、间距建立明确层次
