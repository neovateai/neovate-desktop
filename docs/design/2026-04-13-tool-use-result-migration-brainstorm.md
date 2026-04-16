# Brainstorm: Migrate All Tools to `tool_use_result`

**Date:** 2026-04-13
**Status:** Ready for Plan

## What We're Building

将所有工具的输出从读取 raw `content`（发回给模型的原始文本）切换为优先读取 SDK 的 `tool_use_result`（结构化工具执行结果）。这是一次**全量改造**，涉及三层：

1. **Transformer 层** — `resolveToolOutput()` 统一优先取 `tool_use_result`
2. **类型层** — 每个工具的 `outputSchema` 从 `z.string()` 改为匹配官方结构化类型
3. **组件层** — 所有 tool 组件适配新的结构化 output，同步增强 UI
4. **Fallback 层** — 未识别的非 MCP 工具渲染 raw input/output JSON

## Why This Approach

### 现状问题

当前 `resolveToolOutput()` 仅对 Read 和 AskUserQuestion 两个工具优先取 `tool_use_result`，其余 16+ 个工具直接取 `content`（raw 文本）。这导致：

- **信息丢失** — `content` 是发给模型的压缩/截断文本，`tool_use_result` 包含完整的结构化数据（如 Bash 的 stdout/stderr 分离、Edit 的 structuredPatch、Glob 的文件列表等）
- **组件能力受限** — 组件只能渲染纯文本，无法利用结构化数据做更好的 UI 展示（如 Glob 显示文件数量、Grep 高亮匹配等）
- **与官方实现脱节** — Claude Code TUI 内部使用 `toolUseResult` 渲染所有工具
- **未识别工具不可见** — `default: return null` 导致非预定义工具完全不渲染

### 官方 `tool_use_result` 结构化类型

通过 [官方 SDK 文档](https://code.claude.com/docs/en/agent-sdk/typescript#tool-output-types) 确认的完整类型：

| Tool                | 当前 outputSchema       | 官方 tool_use_result 类型                                                                                      |
| ------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| **Bash**            | `z.string()`            | `{ stdout, stderr, interrupted, isImage?, backgroundTaskId?, rawOutputPath?, structuredContent?, ... }`        |
| **Read**            | ✅ 已结构化             | 已对齐                                                                                                         |
| **Write**           | `z.string()`            | `{ type: "create"\|"update", filePath, content, structuredPatch[], originalFile, gitDiff? }`                   |
| **Edit**            | `z.string()`            | `{ filePath, oldString, newString, originalFile, structuredPatch[], userModified, replaceAll, gitDiff? }`      |
| **MultiEdit**       | `z.string()`            | 同 Edit（多个 patch）                                                                                          |
| **Glob**            | `z.string()`            | `{ durationMs, numFiles, filenames[], truncated }`                                                             |
| **Grep**            | `z.string()`            | `{ mode?, numFiles, filenames[], content?, numLines?, numMatches?, appliedLimit?, appliedOffset? }`            |
| **WebFetch**        | `z.string()`            | `{ bytes, code, codeText, result, durationMs, url }`                                                           |
| **WebSearch**       | `z.string()`            | `{ query, results[], durationSeconds }`                                                                        |
| **NotebookEdit**    | `z.string()`            | `{ new_source, cell_id?, cell_type, language, edit_mode, error?, notebook_path, original_file, updated_file }` |
| **TodoWrite**       | `z.string()`            | `{ oldTodos[], newTodos[] }`                                                                                   |
| **AskUserQuestion** | ✅ 已结构化             | 已对齐                                                                                                         |
| **Agent**           | `z.custom<UIMessage>()` | `{ status, agentId, content[], totalToolUseCount, totalDurationMs, ... }` — 保留 sub-transformer 聚合          |
| **TaskOutput**      | 已结构化                | 需确认                                                                                                         |
| **TaskStop**        | 已结构化                | `{ message, task_id, task_type, command? }`                                                                    |
| **ExitPlanMode**    | `z.string()`            | `{ plan, isAgent, filePath?, hasTaskTool?, ... }`                                                              |
| **EnterWorktree**   | `z.string()`            | `{ worktreePath, worktreeBranch?, message }`                                                                   |
| **BashOutput**      | `z.string()`            | 类似 Bash（TaskOutput 子类型）                                                                                 |
| **Skill**           | `z.string()`            | SDK 内置但未文档化类型，保持 `z.unknown()`                                                                     |

## Key Decisions

### 1. Transformer: 统一 `tool_use_result` 优先

```typescript
// Before
private resolveToolOutput(toolCallId: string, content: unknown, message: any): unknown {
  const toolName = this.specialOutputTools.get(toolCallId);
  switch (toolName) {
    case "AskUserQuestion":
    case "Read":
      return message.tool_use_result ?? content;
    default:
      return content;  // ← 大部分工具走这里
  }
}

// After
private resolveToolOutput(toolCallId: string, content: unknown, message: any): unknown {
  return message.tool_use_result ?? content;  // 所有工具统一优先 tool_use_result
}
```

- 移除 `specialOutputTools` Map 及其相关追踪逻辑
- `tool_use_result` 不存在时仍 fallback 到 `content`（向后兼容旧 SDK 版本）

### 2. outputSchema: 严格对齐官方类型

每个工具的 `outputSchema` 必须精确匹配官方 SDK 文档中的 `tool_use_result` 结构。用 Zod 定义，同时导出对应的 TypeScript 类型。

### 3. 组件改造策略: 全量改造 + UI 增强

对于每个工具组件：

- 将 `output` 从 `string` 类型改为对应的结构化类型
- 充分利用结构化字段渲染更丰富的 UI（如 Bash 分别展示 stdout/stderr、Glob 显示文件数量等）
- 保留 `typeof output === "string"` 的 fallback 路径，兼容旧数据

### 4. Agent/Task 工具: 保留 sub-transformer + 利用元数据

- 保留 sub-transformer 聚合机制生成 UIMessage 用于嵌套渲染
- 从 `tool_use_result` 提取元信息（`totalTokens`、`totalDurationMs`、`agentId`）展示在 Agent header
- 两者共存：UIMessage 用于渲染内容，tool_use_result 用于元信息

### 5. 未识别工具 Fallback 渲染

工具分三类：

| 类别               | 渲染方式                                                     |
| ------------------ | ------------------------------------------------------------ |
| **预定义工具**     | 专属组件（Bash, Read, Edit 等）                              |
| **MCP 工具**       | 专属 MCP 渲染组件（独立任务，不在本次范围）                  |
| **其他未识别工具** | 通用 `<GenericTool>` — 显示工具名 + input JSON + output JSON |

- 在 `ClaudeCodeToolUIPartComponent` 的 `default` 分支渲染 `<GenericTool>`
- 使用 `<Tool>` + `<ToolHeader>` + `<ToolContent>` 原语
- input/output 用 `<CodeBlock>` 展示格式化 JSON

### 6. SlashCommand 工具: 移除

SDK 已不再包含 SlashCommand 工具，从 toolSet 中移除。

## 组件改造详情

### 需要改渲染逻辑的（当前读 string → 改为读结构化对象）

| 组件                 | 当前渲染                           | 结构化后可利用                                |
| -------------------- | ---------------------------------- | --------------------------------------------- |
| **BashTool**         | `$ {command}\n{output}` 拼成代码块 | stdout/stderr 分离、interrupted 状态、isImage |
| **BashOutputTool**   | string 显示在代码块                | status/error 字段                             |
| **GlobTool**         | string 显示在 `<pre>`              | `numFiles`、`filenames[]`、`truncated`        |
| **GrepTool**         | string 显示在 `<pre>`              | `numFiles`、`numMatches`、`content`、`mode`   |
| **WebFetchTool**     | string 传给 `<MessageResponse>`    | `url`、`code`、`result`、`durationMs`         |
| **WebSearchTool**    | string 传给 `<MessageResponse>`    | `query`、`results[]`、`durationSeconds`       |
| **ExitPlanModeTool** | string 文本渲染                    | `plan`、`isAgent`、`filePath`                 |

### 只需改类型，渲染可保持不变的（当前完全忽略 output）

- WriteTool、EditTool、MultiEditTool、NotebookEditTool — 纯靠 `input` 渲染 diff
- EnterPlanModeTool、TodoWriteTool、TaskStopTool — 纯靠 input 或静态文本
- EnterWorktreeTool — 取 `message` 字段即可

### 已经是结构化的，无需改

- ReadTool ✅、AskUserQuestionTool ✅、AgentTool ✅（仅增加元信息展示）

## Scope & Impact

### 需要修改的文件

**Transformer (1 file):**

- `src/main/features/agent/sdk-message-transformer.ts` — 简化 `resolveToolOutput()`，移除 `specialOutputTools`

**Tool 定义 (15+ files):**

- `src/shared/claude-code/tools/` 下除 read.ts、ask-user-question.ts、agent.ts 外的所有工具文件

**Tool 组件 (14+ files):**

- `src/renderer/src/features/agent/components/tool-parts/` 下所有工具组件
- 新增 `generic-tool.tsx` 用于未识别工具 fallback
- 修改 `index.tsx` 的 default 分支

**测试:**

- `src/main/features/agent/__tests__/sdk-message-transformer.test.ts`
- Playground 文件需要更新 mock 数据

## Resolved Questions

1. **组件改造后的 UI 增强范围？** → 同步增强，既然有了结构化数据就充分利用
2. **SlashCommand 和 Skill？** → SlashCommand 已从 SDK 移除，删除。Skill 保持 `z.unknown()`
3. **Agent/Task 聚合机制？** → 保留 sub-transformer，同时从 tool_use_result 提取元信息共存
4. **未识别工具渲染？** → 非 MCP 未识别工具用 GenericTool 展示 raw JSON；MCP 渲染为独立任务

## Open Questions

1. **MultiEdit 的 `tool_use_result` 结构？** — 官方文档没有单独列出，需要运行时确认或参考 SDK 源码
2. **BashOutput (TaskOutput) 的具体结构？** — 需要确认是否复用 Bash 的输出结构
3. **EnterPlanMode 是否需要改造？** — 文档中未提到此工具的输出类型
