# Claude Agent SDK Chat 设计文档

## 1. 概览

基于 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk)（Anthropic 官方的 Agent 开发框架）构建多 session 的 Web Chat。前端复用 [AI SDK](https://github.com/vercel/ai)（Vercel 的通用 LLM Chat 前端框架）的 `AbstractChat`（UIMessage 组装、流式消费、schema 校验、tool 回调、job 序列化），后端通过 [oRPC](https://orpc.unnoq.com/)（类型安全的 RPC 框架，支持流式端点）暴露 API。

### 三个核心问题

AI SDK 是为通用 LLM Chat 设计的，与 Claude Agent SDK 的场景有三个不匹配：

| #   | 问题                           | AI SDK 现状                                                                                          | 方案                                                                                  |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1   | **ChatTransport 只支持消息流** | `sendMessages()` 一条流，无法承载 task 进度、系统通知等事件                                          | `ClaudeCodeChatTransport` 在 `sendMessages()` 基础上增加 `subscribe()` + `dispatch()` |
| 2   | **useChat 是单 session**       | 组件生命周期内一个 Chat 实例，无法并发管理                                                           | `ClaudeCodeChatManager` 管理 Chat 实例 + 每 session 独立 Zustand store                |
| 3   | **SDK 回调需要双向交互**       | 无 request/response 机制；`tool-approval-request` chunk 不适用（审批 UI 是悬浮弹窗，不在消息渲染流） | subscribe 流增加 `kind: 'request'` + `dispatch` RPC 端点                              |

### 设计优势

- **规范的数据流** — SDK 的单一消息流被拆分为三个职责明确的端点：消息流（stream，驱动 UI 消息渲染）、订阅流（subscribe，承载事件推送 + 交互请求）、指令（dispatch，回传用户决策 + 设置变更），各端点职责单一，互不干扰
- **统一的数据结构** — 所有流的输入输出都有明确的类型定义（`ClaudeCodeUIMessageChunk`、`ClaudeCodeUIEvent`、`ClaudeCodeUIDispatch`），前后端共享类型
- **协议兼容，最小扩展** — 消息流完全遵守 AI SDK 的 chunk 协议（`start` / `text-delta` / `tool-input-available` / `finish` 等），数据内容直接透传 SDK 原始结构（snake_case 保持原样、字段不转换），既符合 AI SDK 最佳实践，又避免自建映射层的维护成本
- **完全的类型安全** — Chunk 类型从 AI SDK 推导（`InferUIMessageChunk`），事件类型编译期校验全覆盖（`Exclude<SDKMessage, ...>` 为 `never`），SDK 新增类型时编译直接报错
- **可观测** — 每条消息、每个事件、每个交互请求都有唯一 `id` / `requestId`，可追踪完整的请求-响应链路
- **前端解耦** — UI 层只需消费 Zustand store 的状态变更（`messages`、`pendingRequests`、`status`），所有流的消费、组装、分发逻辑都封装在 `ClaudeCodeChat` 内部，组件只管渲染
- **多 Agent 扩展基础** — subscribe 流的两层结构（`kind` + `event.type` / `request.type`）和 Transport 模式，天然支持接入新的 Agent 类型而不影响现有逻辑（见第 5 节）

### 完整架构图

```
┌──────────────────────────────────────────────────────────────────────┐
│  后端                                                                │
│                                                                      │
│  Claude Agent SDK                                                    │
│  ┌──────────────┐     ┌──────────────────────────────────────────┐  │
│  │ query()      │────▶│ stream handler (async generator)         │  │
│  │ async iter   │     │                                          │  │
│  │              │     │ for await (msg of query) {               │  │
│  │ SDKMessage   │     │   if (消息类) yield chunk ──────────────────────▶ stream 流
│  │ stream       │     │   if (事件类) publisher.publish() ──┐    │  │
│  └──────────────┘     └──────────────────────────────────┘  │    │  │
│                                                              │    │  │
│  ┌──────────────┐          ┌──────────────────────┐         │    │  │
│  │ canUseTool   │──────────▶ publisher.publish()  │◀────────┘    │  │
│  │ 回调         │          │ (EventPublisher)     │              │  │
│  │              │◀─resolve─┤                      │──────────────────▶ subscribe 流
│  └──────────────┘          └──────────────────────┘              │  │
│                                                                      │
│  ┌──────────────┐                                                │  │
│  │ dispatch       │◀──────────────────────────────────────────────────── dispatch RPC
│  │ handler      │─── 按 kind 路由（respond / configure）        │  │
│  └──────────────┘                                                │  │
│                                                                      │
│          oRPC Server                                                 │
└──────────────────────────────────────────────────────────────────────┘
            │ stream 流                │ subscribe 流        ▲ dispatch RPC
            │ ClaudeCodeUIMessageChunk │ ClaudeCodeUIEvent   │ ClaudeCodeUIDispatch
            ▼                          ▼                     │
┌──────────────────────────────────────────────────────────────────────┐
│  前端                                                                │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ ClaudeCodeChatTransport                                      │   │
│  │   sendMessages() → rpc.stream()                               │   │
│  │   subscribe()    → rpc.subscribe()                           │   │
│  │   dispatch()       → rpc.dispatch()                              │   │
│  └──────────────────────────────┬───────────────────────────────┘   │
│                                  │                                    │
│  ┌───────────────────────────────▼──────────────────────────────┐   │
│  │ ClaudeCodeChat (extends AbstractChat)                        │   │
│  │                                                              │   │
│  │  消息流 → AbstractChat 内部消费 → UIMessage 组装             │   │
│  │  订阅流 → #handleMessage()                                   │   │
│  │    ├─ kind: 'event'   → #handleEvent(msg.event) → store      │   │
│  │    └─ kind: 'request' → store.pendingRequests                 │   │
│  │  respondToRequest()   → transport.dispatch()                   │   │
│  └──────────────────────────────┬───────────────────────────────┘   │
│                                  │                                    │
│  ┌───────────────────────────────▼──────────────────────────────┐   │
│  │ ClaudeCodeChatState (Zustand store)                          │   │
│  │   messages: ClaudeCodeUIMessage[]                            │   │
│  │   status: ChatStatus                                         │   │
│  │   error / eventError                                         │   │
│  │   pendingRequests: { requestId, request }[]                   │   │
│  └──────────────────────────────┬───────────────────────────────┘   │
│                                  │ useStore()                         │
│  ┌───────────────────────────────▼──────────────────────────────┐   │
│  │ React 组件                                                   │   │
│  │   useClaudeCodeChat(sessionId)                               │   │
│  │   → { messages, status, pendingRequests, sendMessage, ... }   │   │
│  │   → 纯渲染，无业务逻辑                                       │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ClaudeCodeChatManager: Map<sessionId, ClaudeCodeChat>               │
└──────────────────────────────────────────────────────────────────────┘
```

### 对照 AI SDK

```
@ai-sdk/react                    Claude Code 版本
──────────────────────────────   ──────────────────────────────
ReactChatState<UI_MESSAGE>       ClaudeCodeChatState（Zustand store）
Chat<UI_MESSAGE>                 ClaudeCodeChat（+ 事件流订阅）
DefaultChatTransport             ClaudeCodeChatTransport
useChat({ chat })                useClaudeCodeChat(sessionId)（通过 Manager 获取 Chat）
```

---

## 2. API 设计

### 2.1 oRPC Contract

```typescript
import { oc, eventIterator } from "@orpc/contract";
import { type } from "@orpc/server";

const contract = {
  // 消息流：SDKMessage → UIMessageChunk
  stream: oc
    .input(type<{ sessionId: string; message: ClaudeCodeUIMessage }>)
    .output(eventIterator(type<ClaudeCodeUIMessageChunk>)),

  // 订阅流：事件推送（kind: 'event'）+ 交互请求（kind: 'request'）
  subscribe: oc.input(type<{ sessionId: string }>).output(eventIterator(type<ClaudeCodeUIEvent>)),

  // 客户端指令：回应交互请求 + 设置变更
  dispatch: oc
    .input(type<{ sessionId: string; dispatch: ClaudeCodeUIDispatch }>)
    .output(type<ClaudeCodeUIDispatchResult>),
};
```

> 注：`newSession`、`supportedModels`、`supportedCommands` 等辅助端点不在核心 contract 内，后续按需定义。

**设计决策**：

- 使用 `type<T>`（纯类型约束，无运行时校验）— 复杂类型用 Zod schema 描述成本高且容易漂移。前端发送的 UIMessage 经过 `AbstractChat.sendMessage()` 构造，格式已保证正确，无需二次校验
- **`subscribe` 合并事件和交互请求** — 前端只需订阅一个流，通过 `kind` 区分纯推送事件和需要回复的请求。避免多流导致的多套订阅/错误处理/重连逻辑
- **`dispatch` 独立端点** — 客户端指令（回应交互请求、设置变更等）走单独 RPC，`subscribe` 流保持单向推送

### 2.2 实现架构

SDK 只有一个消息入口（`query()` 返回的 async iterable），oRPC 对外暴露消息流和订阅流。通过 `EventPublisher` 作为旁路实现分发：

```
SDK query() → 单一消息流
        ↓
   stream handler（async generator）
   for await (const msg of query) {
     ├→ 消息类 → yield chunk                    // 直接在 generator 里产出
     └→ 事件类 → publisher.publish("subscribe")  // 推到旁路
   }

SDK Options.canUseTool 回调
   → publisher.publish("subscribe", { kind: "request", ... })  // 推权限请求
   → 挂起 Promise，等待 dispatch 端点 resolve

subscribe handler（async generator）
   for await (const msg of publisher.subscribe("subscribe")) {
     yield msg                                   // 推给前端
   }

dispatch handler
   → 按 dispatch.kind 路由
   → kind: 'respond' → 按 requestId 找到挂起的 Promise → resolve(dispatch.respond.result)
   → kind: 'configure' → 调 query.setPermissionMode() 等 SDK 方法
```

- **stream** — async generator 直接 yield `ClaudeCodeUIMessageChunk`，SDK 消息流驱动
- **subscribe** — 前端订阅时创建 async generator，从 `EventPublisher` 消费。包含事件推送（`kind: 'event'`）和交互请求（`kind: 'request'`）
- **dispatch** — 前端发送客户端指令（回应交互请求、设置变更等），后端按 `kind` 路由处理
- 所有流共享同一个 `sessionId`，`EventPublisher` 按 session 隔离

### 2.3 类型定义

#### 类型总览

| 分类     | 类型                         | 用途                                                    |
| -------- | ---------------------------- | ------------------------------------------------------- |
| Message  | `ClaudeCodeUIMessage`        | 前端 UIMessage（定义见 `docs/types.ts`）                |
| Message  | `ClaudeCodeUIMessageChunk`   | `stream` 流输出（`InferUIMessageChunk` 推导）           |
| Event    | `ClaudeCodeUIEvent`          | `subscribe` 流输出（`kind: 'event' \| 'request'`）      |
| Event    | `ClaudeCodeUIEventMessage`   | 纯事件数据（SDK 透传 + `id`）                           |
| Event    | `ClaudeCodeUIEventRequest`   | 交互请求（`permission_request` 等）                     |
| Dispatch | `ClaudeCodeUIDispatch`       | `dispatch` 端点输入（`kind: 'respond' \| 'configure'`） |
| Dispatch | `ClaudeCodeUIDispatchResult` | `dispatch` 端点输出（按 `kind` 区分）                   |

#### ClaudeCodeUIMessageChunk

由 AI SDK 的 `InferUIMessageChunk` 从 `ClaudeCodeUIMessage` 推导：

```typescript
import type { InferUIMessageChunk } from "ai";
import type { ClaudeCodeUIMessage } from "./types";

export type ClaudeCodeUIMessageChunk = InferUIMessageChunk<ClaudeCodeUIMessage>;
```

AI SDK 支持自定义 Data Part：chunk 类型为 ``{ type: `data-${NAME}`, data: T }``，`NAME` 来自 `ClaudeCodeDataParts` 的 key。我们定义了两个：

```typescript
type DataPartEntry<M extends { type: string; subtype: string }> = {
  [K in `${M["type"]}/${M["subtype"]}`]: M;
};

type ClaudeCodeDataParts = DataPartEntry<SDKSystemMessage> & // → { "system/init": SDKSystemMessage }
  DataPartEntry<SDKCompactBoundaryMessage>; // → { "system/compact_boundary": SDKCompactBoundaryMessage }
```

#### ClaudeCodeUIEvent

`subscribe` 端点推送的消息，通过 `kind` 区分纯推送事件和需要回复的交互请求：

```typescript
type ClaudeCodeUIEvent =
  | { kind: "event"; event: ClaudeCodeUIEventMessage }
  | { kind: "request"; requestId: string; request: ClaudeCodeUIEventRequest };
```

- `kind: 'event'` — 纯推送，前端收到更新 UI 即可（字段名 `event` 与 `kind` 语义对应）
- `kind: 'request'` — 需要回复，前端展示交互 UI，用户决策后调 `dispatch` 端点（字段名 `request` 与 `kind` 语义对应）

**设计决策**：

- **`kind` 而非 `type`** — `data` 内部已有 `type` 字段（SDK 原始类型判别），顶层用 `kind` 避免冲突
- **两层结构而非打平** — 前端可以写通用的 request handler（弹窗 + 管理 requestId + 调 dispatch），加新的 request 类型不影响通用逻辑
- **字段名与 `kind` 语义对应** — `kind: 'event'` 对应 `event` 字段，`kind: 'request'` 对应 `request` 字段，避免泛化的 `data` 命名

#### ClaudeCodeUIEventMessage

事件数据，透传 SDK 原始字段，仅加 `id`：

```typescript
type ClaudeCodeUIEventPart =
  | SDKResultMessage // ← 交集：消息流 finish + 事件流 session done/error
  | SDKSystemMessage // ← 交集：消息流 data part (init) + 事件流
  | SDKStatusMessage
  | SDKLocalCommandOutputMessage
  | SDKHookStartedMessage
  | SDKHookProgressMessage
  | SDKHookResponseMessage
  | SDKToolProgressMessage
  | SDKAuthStatusMessage
  | SDKTaskNotificationMessage
  | SDKTaskStartedMessage
  | SDKTaskProgressMessage
  | SDKFilesPersistedEvent
  | SDKToolUseSummaryMessage
  | SDKRateLimitEvent
  | SDKElicitationCompleteMessage
  | SDKPromptSuggestionMessage;

type ClaudeCodeUIEventMessage = { id: string } & ClaudeCodeUIEventPart;
```

**设计决策**：

- **透传 SDK 原始结构**，不做字段转换（snake_case 保持原样）— 前期定制成本小，SDK 类型变化时无需同步维护映射层
- **统一 `id` 字段** — 后端生成：`{ id: msg.uuid ?? randomUUID(), ...msg }`。SDK 部分类型（`SDKToolProgressMessage`、`SDKToolUseSummaryMessage`）没有 `uuid`，需要后端补充

#### ClaudeCodeUIEventRequest / ClaudeCodeUIDispatch

交互请求和客户端指令类型：

```typescript
// 请求（后端 → 前端，通过 subscribe 流推送）
type ClaudeCodeUIEventRequest = {
  type: "permission_request";
  toolName: string;
  input: Record<string, unknown>;
  toolUseId: string;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  agentId?: string;
};
// 后续扩展：
// | { type: 'elicitation_request'; serverName: string; message: string; mode?: 'form' | 'url'; ... }

// 客户端指令（前端 → 后端，通过 dispatch 端点）— kind 区分回应/设置
type ClaudeCodeUIDispatch =
  | {
      kind: "respond";
      requestId: string;
      respond: { type: "permission_request"; result: PermissionResult };
    }
  | { kind: "configure"; configure: { type: "set_permission_mode"; mode: PermissionMode } };

type ClaudeCodeUIDispatchResult =
  | { kind: "respond"; ok: boolean }
  | {
      kind: "configure";
      ok: boolean;
      configure: { type: "set_permission_mode"; mode: PermissionMode };
    };
```

`PermissionResult` 即 SDK 原始类型（`{ behavior: 'allow'; ... } | { behavior: 'deny'; ... }`）。

**设计决策**：

- **`kind` 区分回应类（`respond`）和设置类（`configure`）**，与 subscribe 流的 `kind` 模式对称
- **嵌套结构**：字段名与 `kind` 语义对应（`respond` → `respond` 字段，`configure` → `configure` 字段）
- **直接联合类型**，新增操作只需加联合成员
- **`requestId` 只在 `kind: 'respond'` 时存在** — 只有回应交互请求才需要关联 requestId

#### 编译期校验

消息流和事件流都正向列举，编译期确保已处理的 SDK 类型全覆盖（`SDKPartialAssistantMessage` 除外，见附录 B）：

```typescript
type AssertTrue<T extends true> = T;
type IsNever<T> = [T] extends [never] ? true : false;

type ChunkInput = Parameters<typeof toUIMessageChunks>[0];

// 1. 完整性：SDKMessage 的每个类型都至少出现在一边（排除 SDKPartialAssistantMessage）
type _Unhandled = Exclude<
  SDKMessage,
  ClaudeCodeUIEventPart | ChunkInput | SDKPartialAssistantMessage
>;
type _ = AssertTrue<IsNever<_Unhandled>>;

// 2. 无多余（事件侧）
type _ExtraInEvent = Exclude<ClaudeCodeUIEventPart, SDKMessage>;
type __ = AssertTrue<IsNever<_ExtraInEvent>>;

// 3. 无多余（消息侧）
type _ExtraInChunk = Exclude<ChunkInput, SDKMessage>;
type ___ = AssertTrue<IsNever<_ExtraInChunk>>;
```

---

## 3. 数据转换

### 3.1 SDKMessage 分类

后端收到 SDK 的消息流后，需要将每条 `SDKMessage` 分流：

| 分类   | 去向               | 处理                                                                  |
| ------ | ------------------ | --------------------------------------------------------------------- |
| 消息类 | `rpc.stream` 流    | 转换为 `ClaudeCodeUIMessageChunk`                                     |
| 事件类 | `rpc.subscribe` 流 | 加 `id` 后透传为 `{ kind: 'event', event: ClaudeCodeUIEventMessage }` |

注：`canUseTool` 回调触发的交互请求不在 SDK 消息流里，而是通过 `Options.canUseTool` 回调独立推入 `subscribe` 流（`kind: 'request'`）。

#### 消息类（→ toUIMessageChunks）

| SDKMessage 类型              | 转换目标                                                        |
| ---------------------------- | --------------------------------------------------------------- |
| SDKAssistantMessage          | text-start/delta/end, reasoning-start/delta/end, tool-call 相关 |
| SDKUserMessage (tool_result) | tool-output-available / tool-output-error                       |
| SDKUserMessageReplay         | 同 SDKUserMessage                                               |
| SDKResultMessage             | finish-step, finish                                             |
| SDKSystemMessage (init)      | data-system/init                                                |
| SDKCompactBoundaryMessage    | data-system/compact_boundary                                    |
| SDKPartialAssistantMessage   | TODO: 真正流式支持（见附录 B）                                  |

#### 事件类（→ 透传）

| SDKMessage 类型               | type              | subtype              |
| ----------------------------- | ----------------- | -------------------- |
| SDKStatusMessage              | system            | status               |
| SDKLocalCommandOutputMessage  | system            | local_command_output |
| SDKHookStartedMessage         | system            | hook_started         |
| SDKHookProgressMessage        | system            | hook_progress        |
| SDKHookResponseMessage        | system            | hook_response        |
| SDKTaskStartedMessage         | system            | task_started         |
| SDKTaskProgressMessage        | system            | task_progress        |
| SDKTaskNotificationMessage    | system            | task_notification    |
| SDKFilesPersistedEvent        | system            | files_persisted      |
| SDKElicitationCompleteMessage | system            | elicitation_complete |
| SDKToolProgressMessage        | tool_progress     | —                    |
| SDKToolUseSummaryMessage      | tool_use_summary  | —                    |
| SDKAuthStatusMessage          | auth_status       | —                    |
| SDKRateLimitEvent             | rate_limit_event  | —                    |
| SDKPromptSuggestionMessage    | prompt_suggestion | —                    |

所有 SDKMessage 类型均分流到消息类或事件类，无忽略项。`SDKPartialAssistantMessage` 暂不处理（见附录 B），启用流式后需额外支持。

### 3.2 一轮对话的 Chunk 流

以下基于实际 SDK 输出（`query()` 消息流）：

```
#   SDKMessage type/subtype      content                UIMessageChunk type
──────────────────────────────────────────────────────────────────────────────
1   system.init                  —                      start + data-system/init
2   assistant (message.id=A)     [thinking]             start-step + reasoning-start/delta/end
3   assistant (message.id=A)     [tool_use]             tool-input-available
                                                        finish-step（新 step 或 result 前触发）
4   rate_limit_event             —                      （subscribe 流）
5   user                         [tool_result]          tool-output-available（不属于任何 step）
6   assistant (message.id=B)     [thinking]             start-step + reasoning-start/delta/end
7   assistant (message.id=B)     [tool_use]             tool-input-available
                                                        finish-step（新 step 或 result 前触发）
8   user                         [tool_result]          tool-output-available（不属于任何 step）
9   assistant (message.id=C)     [text]                 start-step + text-start/delta/end
10  result.success               —                      finish-step + finish
```

**step 语义（与 AI SDK 一致）**：

- **一个 step = 一次 LLM API 调用**，不含工具执行
- `start-step`: 新的 `message.id` 首次出现时发出
- `finish-step`: 下一个 step 开始前，或 `result` 到达时发出
- 同一次 LLM 调用的多条 assistant 消息（如 thinking + tool_use）共享 `message.id`，属于同一个 step
- `user` tool_result 不触发 step 边界，它不属于任何 step

### 3.3 SDKMessage → Chunk 映射

| SDKMessage type                     | content         | 产出的 Chunk                                                                        |
| ----------------------------------- | --------------- | ----------------------------------------------------------------------------------- |
| `system` subtype=`init`             | —               | `start` + `data-system/init`                                                        |
| `system` subtype=`compact_boundary` | —               | `data-system/compact_boundary`                                                      |
| `assistant`（新 message.id）        | `[thinking]`    | (`finish-step` 如果上一个 step 未结束) + `start-step` + `reasoning-start/delta/end` |
| `assistant`（同 message.id）        | `[tool_use]`    | `tool-input-available`（同一个 step 内）                                            |
| `assistant`（新 message.id）        | `[text]`        | (`finish-step` 如果上一个 step 未结束) + `start-step` + `text-start/delta/end`      |
| `user`                              | `[tool_result]` | `tool-output-available`（不触发 step 边界）                                         |
| `user`                              | `[text]`        | `text-start/delta/end`（SDK 内部流转的文本，非用户输入）                            |
| `result` subtype=`success`          | —               | (`finish-step` 如果在 step 内) + `finish`                                           |
| `result` subtype!=`success`         | —               | (`finish-step` 如果在 step 内) + `error` + `finish`                                 |
| `rate_limit_event` 等               | —               | 不产出 chunk，走 subscribe 流                                                       |

### 3.4 SDKMessageTransformer

有状态转换器，跟踪两个状态：

- **`inStep`** — 是否在当前 step 内
- **`currentMessageId`** — 当前 step 对应的 `message.id`，用于判断是否是同一次 LLM 调用

通过 `message.id` 判断 step 边界：同一次 LLM 调用的多条 assistant 消息共享 `message.id`（如 thinking + tool_use），属于同一个 step；不同的 `message.id` 意味着新的 LLM 调用，触发新 step。

具体实现见附录 A。

### 3.5 `canUseTool` 交互流程

```
1. SDK 内部要执行工具 → 调 canUseTool 回调
2. 后端 canUseTool 回调：
   - 生成 requestId
   - publisher.publish("subscribe", { kind: "request", requestId, request: { type: "permission_request", ... } })
   - return new Promise(挂起)
3. 前端 subscribe 流收到 kind: "request"，弹窗展示工具名、输入、原因
4. 用户点击 allow/deny → 前端调 rpc.dispatch({ sessionId, dispatch: { kind: 'respond', requestId, respond: { type: 'permission_request', result: { behavior: "allow" | "deny" } } } })
5. 后端 dispatch handler 按 kind 路由，resolve 挂起的 Promise
6. SDK 继续执行（或中断）
```

**设计决策**：

- **`canUseTool` 不走 chunk 流** — 虽然 AI SDK 有 `tool-approval-request` chunk，但前端审批 UI 是 chatInput 附近的悬浮弹窗，不在消息渲染流里，无需改 tool invocation 状态
- **后端挂起 Promise** — `pendingRequests: Map<requestId, { resolve, reject }>`，`canUseTool` 回调的 `signal.abort` 时清理
- **`requestId` 由后端生成**（`crypto.randomUUID()`），不用 SDK 的 `toolUseId` — requestId 是请求-响应配对用的，跟工具调用 ID 解耦

---

## 4. 前端架构

### 4.1 ClaudeCodeChatTransport

封装 oRPC client，提供消息流、订阅流、客户端指令和查询方法：

```typescript
import { eventIteratorToUnproxiedDataStream } from "@orpc/client";

class ClaudeCodeChatTransport {
  constructor(private rpc: ContractRouterClient<typeof claudeCodeContract>) {}

  async sendMessages(options) {
    // Claude Agent SDK 服务端维护会话历史，只需发送最后一条 UIMessage
    const lastMessage = options.messages.at(-1)!;

    return eventIteratorToUnproxiedDataStream(
      await this.rpc.stream(
        {
          sessionId: options.chatId,
          message: lastMessage,
        },
        { signal: options.abortSignal },
      ),
    );
  }

  reconnectToStream() {
    return null; // 不支持断线重连，返回 null 让 AI SDK 优雅降级
  }

  subscribe({ chatId }: { chatId: string }) {
    return this.rpc.subscribe({ sessionId: chatId });
  }

  async dispatch({
    chatId,
    dispatch,
  }: {
    chatId: string;
    dispatch: ClaudeCodeUIDispatch;
  }): Promise<ClaudeCodeUIDispatchResult> {
    return this.rpc.dispatch({ sessionId: chatId, dispatch });
  }
}
```

### 4.3 ClaudeCodeChatState

对标 AI SDK 的 `ReactChatState`，每个 Chat 实例内部创建独立 Zustand store，implements `ChatState`。

```typescript
import { createStore, type StoreApi } from "zustand/vanilla";
import type { ChatState, ChatStatus } from "ai";

interface ClaudeCodeChatStoreState {
  // --- ChatState 必需字段 ---
  messages: ClaudeCodeUIMessage[];
  status: ChatStatus;
  error: Error | undefined;

  // --- 业务扩展字段 ---
  eventError: Error | undefined; // 事件流错误（与消息流 error 分开）
  pendingRequests: Array<ClaudeCodeUIEvent & { kind: "request" }>; // 待用户响应的交互请求
}

export class ClaudeCodeChatState implements ChatState<ClaudeCodeUIMessage> {
  readonly store: StoreApi<ClaudeCodeChatStoreState>;

  constructor(initialMessages: ClaudeCodeUIMessage[] = []) {
    this.store = createStore<ClaudeCodeChatStoreState>(() => ({
      messages: initialMessages,
      status: "ready",
      error: undefined,
      eventError: undefined,
      pendingRequests: [],
    }));
  }

  // --- ChatState 接口实现 ---

  get messages() {
    return this.store.getState().messages;
  }
  set messages(messages: ClaudeCodeUIMessage[]) {
    this.store.setState({ messages });
  }

  get status() {
    return this.store.getState().status;
  }
  set status(status: ChatStatus) {
    this.store.setState({ status });
  }

  get error() {
    return this.store.getState().error;
  }
  set error(error: Error | undefined) {
    this.store.setState({ error });
  }

  pushMessage = (message: ClaudeCodeUIMessage) => {
    this.store.setState((state) => ({ messages: state.messages.concat(message) }));
  };

  popMessage = () => {
    this.store.setState((state) => ({ messages: state.messages.slice(0, -1) }));
  };

  replaceMessage = (index: number, message: ClaudeCodeUIMessage) => {
    this.store.setState((state) => ({
      messages: [
        ...state.messages.slice(0, index),
        this.snapshot(message),
        ...state.messages.slice(index + 1),
      ],
    }));
  };

  snapshot = <T>(v: T): T => structuredClone(v);
}
```

### 4.4 ClaudeCodeChat

对标 React 版 `Chat`，extends `AbstractChat`，增加 subscribe 流消费和交互请求响应：

```typescript
import { AbstractChat } from "ai";
import { consumeEventIterator } from "@orpc/client";

export class ClaudeCodeChat extends AbstractChat<ClaudeCodeUIMessage> {
  readonly id: string;
  #state: ClaudeCodeChatState;
  #transport: ClaudeCodeChatTransport;
  #unsubscribe?: () => Promise<void>;

  constructor({ messages, transport, ...init }: ClaudeCodeChatInit) {
    const state = new ClaudeCodeChatState(messages);
    super({ ...init, transport, state });
    this.id = init.id;
    this.#state = state;
    this.#transport = transport;

    this.#unsubscribe = consumeEventIterator(transport.subscribe({ chatId: init.id }), {
      onEvent: (msg) => this.#handleMessage(msg),
      onError: (error) => {
        this.#state.store.setState({ eventError: error });
      },
    });
  }

  get store() {
    return this.#state.store;
  }

  #handleMessage(msg: ClaudeCodeUIEvent) {
    if (msg.kind === "event") {
      this.#handleEvent(msg.event);
    } else {
      // kind: 'request' → 加入 pendingRequests，等用户响应
      this.#state.store.setState((state) => ({
        pendingRequests: [...state.pendingRequests, msg],
      }));
    }
  }

  /** 响应交互请求（前端 UI 调用） */
  respondToRequest = async (
    requestId: string,
    respond: { type: "permission_request"; result: PermissionResult },
  ) => {
    const result = await this.#transport.dispatch({
      chatId: this.id,
      dispatch: { kind: "respond", requestId, respond },
    });
    if (result.ok) {
      this.#state.store.setState((state) => ({
        pendingRequests: state.pendingRequests.filter((r) => r.requestId !== requestId),
      }));
    }
  };

  dispose = async () => {
    await this.#unsubscribe?.();
  };
}
```

### 4.5 ClaudeCodeChatManager

管理 Chat 实例生命周期，内部持有共享的 `ClaudeCodeChatTransport`：

```typescript
export class ClaudeCodeChatManager {
  private chats = new Map<string, ClaudeCodeChat>();
  private transport: ClaudeCodeChatTransport;

  constructor(private rpc: ContractRouterClient<typeof claudeCodeContract>) {
    this.transport = new ClaudeCodeChatTransport(rpc);
  }

  async createSession(cwd: string): Promise<string> {
    const { sessionId } = await this.rpc.newSession({ cwd });

    this.chats.set(
      sessionId,
      new ClaudeCodeChat({
        id: sessionId,
        transport: this.transport,
        messageMetadataSchema: claudeCodeMetadataSchema,
        dataPartSchemas: claudeCodeDataPartSchemas,
      }),
    );

    return sessionId;
  }

  restoreSession(sessionId: string, messages: ClaudeCodeUIMessage[]) {
    if (this.chats.has(sessionId)) throw new Error(`Session already active: ${sessionId}`);

    this.chats.set(
      sessionId,
      new ClaudeCodeChat({
        id: sessionId,
        messages,
        transport: this.transport,
        messageMetadataSchema: claudeCodeMetadataSchema,
        dataPartSchemas: claudeCodeDataPartSchemas,
      }),
    );
  }

  getChat(sessionId: string) {
    return this.chats.get(sessionId);
  }

  async removeSession(sessionId: string) {
    const chat = this.chats.get(sessionId);
    chat?.stop();
    await chat?.dispose();
    this.chats.delete(sessionId);
  }
}
```

### 4.6 React 集成

#### useClaudeCodeChat

对标 AI SDK 的 `useChat`，通过 sessionId 获取 Chat 实例并订阅 store 状态：

```typescript
import { useStore } from "zustand";

function useClaudeCodeChat(sessionId: string) {
  const chat = claudeCodeChatManager.getChat(sessionId);
  if (!chat) throw new Error(`Unknown session: ${sessionId}`);

  const messages = useStore(chat.store, (s) => s.messages);
  const status = useStore(chat.store, (s) => s.status);
  const error = useStore(chat.store, (s) => s.error);
  const eventError = useStore(chat.store, (s) => s.eventError);
  const pendingRequests = useStore(chat.store, (s) => s.pendingRequests);

  return {
    id: sessionId,
    messages,
    status,
    error, // 消息流错误（AbstractChat 管理）
    eventError, // 事件流错误（ClaudeCodeChat 管理）
    pendingRequests, // 待响应的交互请求
    sendMessage: chat.sendMessage,
    respondToRequest: chat.respondToRequest,
    stop: chat.stop,
    dispose: chat.dispose,
  };
}
```

#### 组件示例

```typescript
function ChatComponent({ sessionId }: { sessionId: string }) {
  const { messages, status, error, pendingRequests, sendMessage, respondToRequest, stop } =
    useClaudeCodeChat(sessionId);

  return (
    <div>
      <MessageList messages={messages} />
      {status === "streaming" && <StreamingIndicator onStop={stop} />}
      {error && <ErrorBanner error={error} />}
      {[...pendingRequests.values()].map((req) => (
        <PermissionDialog
          key={req.requestId}
          request={req.request}
          onAllow={() => respondToRequest(req.requestId, { type: 'permission_request', result: { behavior: 'allow' } })}
          onDeny={() => respondToRequest(req.requestId, { type: 'permission_request', result: { behavior: 'deny', message: 'User denied' } })}
        />
      ))}
      <PromptInput
        onSubmit={(text) => sendMessage({ text })}
        disabled={status !== "ready"}
      />
    </div>
  );
}
```

### 4.7 完整链路

#### 消息流（stream）

```
用户输入 prompt
  │
  ▼
chat.sendMessage(message?)              ← ClaudeCodeChat (extends AbstractChat)
  │
  ▼
transport.sendMessages()                ← ClaudeCodeChatTransport
  │  rpc.stream({ sessionId, message })
  │
  ▼                                      后端（async generator）
  │                                      SDKMessage → toUIMessageChunks() → yield
  │
  ▼
AbstractChat 内部消费流
  │  processUIMessageStream(...)
  │
  ▼
ClaudeCodeChatState → store.setState({ messages })
  │
  ▼
Zustand store 更新 → React 重渲染
```

#### 订阅流（subscribe）

```
ClaudeCodeChat 构造时
  │
  └─ consumeEventIterator(transport.subscribe({ chatId }))
       │
       ▼
     #handleMessage(msg: ClaudeCodeUIEvent)
       │
       ├─ kind: 'event' → #handleEvent(msg.event)
       │    → store.setState({ tasks: ... }) 等业务逻辑
       │
       └─ kind: 'request' → store.pendingRequests.push(msg)
            │
            ▼
          React 重渲染 → 弹窗展示交互请求
            │
            ▼ 用户点击 allow/deny
          chat.respondToRequest(requestId, respond)
            │
            └─ transport.dispatch({ chatId, dispatch: { kind: 'respond', requestId, respond } })
               → rpc.dispatch(...) → 后端 dispatch handler 按 kind 路由 → resolve Promise → SDK 继续
```

### 4.8 关键设计决策

| 领域     | 决策                                                                   | 原因                                             |
| -------- | ---------------------------------------------------------------------- | ------------------------------------------------ |
| **API**  | `type<T>` 纯类型约束，无运行时 Zod 校验                                | 前端 AbstractChat 已保证格式正确                 |
| **API**  | subscribe 合并事件 + 交互请求（`kind` 区分）                           | 避免多流的订阅/错误处理/重连逻辑                 |
| **API**  | `kind` 而非 `type` 作顶层判别                                          | `data` 内部已有 `type`（SDK 原始字段），避免冲突 |
| **转换** | Chunk 类型从 AI SDK 推导（`InferUIMessageChunk`）                      | 不自定义，编译期安全                             |
| **转换** | 事件透传 SDK 原始结构（snake_case 保持原样）                           | 前期无转换成本，SDK 变化时无映射层维护           |
| **转换** | 有状态转换器（`SDKMessageTransformer` 类）                             | 需跟踪 step 边界和 message.id                    |
| **转换** | `finish-step` 延迟到下一个 step 或 result                              | tool_result 不属于 step，不触发边界              |
| **前端** | 每 session 独立 Zustand store                                          | 隔离性好，无 Map 路由，性能更优                  |
| **前端** | `ClaudeCodeChatTransport` 独立类（不依赖泛型接口）                     | YAGNI — 等真的有第二个 Agent 时再抽取通用接口    |
| **前端** | stop() 停消息流，dispose() 停事件流                                    | stop 是单次请求级别，dispose 是 session 级别     |
| **交互** | `canUseTool` 不走 chunk 流                                             | 审批 UI 是悬浮弹窗，不在消息渲染流               |
| **交互** | `requestId` 由后端生成，不用 SDK 的 `toolUseId`                        | 请求-响应配对用，与工具调用 ID 解耦              |
| **交互** | `ClaudeCodeUIDispatch` 用 `kind` 联合类型区分                          | 单端点多指令，扩展只需加联合成员                 |
| **交互** | `dispatch` 端点统一 respond + configure，`kind` 路由                   | 单端点多操作，与 subscribe 流的 `kind` 模式对称  |
| **交互** | subscribe 流字段名与 `kind` 语义对应（`event` / `request`）            | 避免泛化的 `data` 命名，可读性更高               |
| **前端** | `ClaudeCodeChat` 持有具体 `ClaudeCodeChatTransport` 类型（非泛型接口） | YAGNI — 具体类不需要多态                         |

---

## 5. 多 Agent 扩展

### 架构天然支持多 Agent

当前架构的以下设计为接入多 Agent 预留了扩展空间：

| 设计点                                                                 | 扩展能力                                                                   |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `ClaudeCodeChatTransport` 模式（sendMessages + subscribe + dispatch）  | 新 Agent 可参照同样的模式实现自己的 Transport 类；未来需要时可抽取通用接口 |
| `ClaudeCodeUIEvent` 两层结构（`kind` + `event.type` / `request.type`） | 新的 `kind` 或 `type` 不影响现有事件处理逻辑                               |
| `ClaudeCodeUIEventRequest` + `ClaudeCodeUIDispatch` 可扩展             | 新 Agent 的交互请求只需加新的 `type` 成员，新的指令只需加联合成员          |
| `ClaudeCodeChatManager` 按 sessionId 隔离                              | 不同 Agent 的 session 互不干扰                                             |
| `pendingRequests` 通用机制                                             | 任何 Agent 的交互请求都走同一套弹窗 → dispatch 流程                        |
| SDK 消息透传（事件不做字段转换）                                       | 新 Agent 的事件结构无需额外映射层                                          |

---

## 附录 A：SDKMessageTransformer 参考实现

```typescript
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { InferUIMessageChunk } from "ai";
import type { ClaudeCodeUIMessage } from "./types";

export type ClaudeCodeUIMessageChunk = InferUIMessageChunk<ClaudeCodeUIMessage>;

export class SDKMessageTransformer {
  private inStep = false;
  private currentMessageId: string | null = null;

  *transform(msg: SDKMessage): Generator<ClaudeCodeUIMessageChunk> {
    switch (msg.type) {
      case "system": {
        if (msg.subtype === "init") {
          this.inStep = false;
          this.currentMessageId = null;
          yield {
            type: "start",
            messageId: msg.uuid,
            messageMetadata: { sessionId: msg.session_id, parentToolUseId: null },
          };
          yield { type: "data-system/init", data: msg };
        } else if (msg.subtype === "compact_boundary") {
          yield { type: "data-system/compact_boundary", data: msg };
        }
        break;
      }

      case "assistant": {
        const isNewStep = msg.message.id !== this.currentMessageId;
        if (isNewStep) {
          if (this.inStep) {
            yield { type: "finish-step" };
          }
          yield { type: "start-step" };
          this.inStep = true;
          this.currentMessageId = msg.message.id;
        }
        yield* this.transformAssistant(msg);
        break;
      }

      case "user": {
        yield* this.transformUser(msg);
        break;
      }

      case "result": {
        if (this.inStep) {
          yield { type: "finish-step" };
        }
        if (msg.subtype !== "success") {
          yield { type: "error", errorText: msg.errors.join("\n") || msg.subtype };
        }
        yield { type: "finish" };
        this.inStep = false;
        this.currentMessageId = null;
        break;
      }
    }
  }

  private *transformAssistant(
    msg: SDKMessage & { type: "assistant" },
  ): Generator<ClaudeCodeUIMessageChunk> {
    for (const part of msg.message.content) {
      switch (part.type) {
        case "text": {
          yield { type: "text-start", id: msg.message.id };
          yield { type: "text-delta", id: msg.message.id, delta: part.text };
          yield { type: "text-end", id: msg.message.id };
          break;
        }
        case "thinking": {
          yield { type: "reasoning-start", id: msg.message.id };
          yield { type: "reasoning-delta", id: msg.message.id, delta: part.thinking };
          yield {
            type: "reasoning-end",
            id: msg.message.id,
            providerMetadata: { claudeCode: { signature: (part as any).signature } },
          };
          break;
        }
        case "tool_use": {
          yield {
            type: "tool-input-available",
            toolCallId: part.id,
            toolName: part.name,
            input: part.input,
            providerExecuted: true,
            providerMetadata: this.claudeCodeMetadata(msg.parent_tool_use_id),
          };
          break;
        }
      }
    }
  }

  private *transformUser(msg: SDKMessage & { type: "user" }): Generator<ClaudeCodeUIMessageChunk> {
    const message = msg as any;
    const content = message.message?.content;

    if (typeof content === "string") {
      yield { type: "text-start", id: message.uuid };
      yield { type: "text-delta", id: message.uuid, delta: content };
      yield { type: "text-end", id: message.uuid };
      return;
    }

    if (!Array.isArray(content)) return;

    for (const part of content) {
      switch (part.type) {
        case "tool_result": {
          const providerMetadata = this.claudeCodeMetadata(message.parent_tool_use_id);
          if (part.is_error) {
            yield {
              type: "tool-output-error",
              toolCallId: part.tool_use_id,
              errorText: typeof part.content === "string" ? part.content : "",
              providerExecuted: true,
              providerMetadata,
            };
          } else {
            yield {
              type: "tool-output-available",
              toolCallId: part.tool_use_id,
              output: part.content,
              providerExecuted: true,
              providerMetadata,
            };
          }
          break;
        }
        case "text": {
          yield { type: "text-start", id: message.uuid };
          yield { type: "text-delta", id: message.uuid, delta: part.text };
          yield { type: "text-end", id: message.uuid };
          break;
        }
      }
    }
  }

  private claudeCodeMetadata(parentToolUseId: string | null | undefined) {
    return parentToolUseId ? { claudeCode: { parentToolUseId } } : undefined;
  }
}

// ─── 事件流（无状态） ─────────────────────────────────────────────────────

type ClaudeCodeUIEventMessage = { id: string } & ClaudeCodeUIEventPart;

type ClaudeCodeUIEventRequest = {
  type: "permission_request";
  toolName: string;
  input: Record<string, unknown>;
  toolUseId: string;
  suggestions?: PermissionUpdate[];
  blockedPath?: string;
  decisionReason?: string;
  agentId?: string;
};

type ClaudeCodeUIEvent =
  | { kind: "event"; event: ClaudeCodeUIEventMessage }
  | { kind: "request"; requestId: string; request: ClaudeCodeUIEventRequest };

export function toUIEvent(msg: SDKMessage): ClaudeCodeUIEvent | null {
  switch (msg.type) {
    case "result":
    case "tool_progress":
    case "tool_use_summary":
    case "auth_status":
    case "prompt_suggestion":
    case "rate_limit_event": {
      return { kind: "event", event: { id: (msg as any).uuid ?? crypto.randomUUID(), ...msg } };
    }
    case "system": {
      // init → 消息流（data-system/init），compact_boundary → 消息流（data-system/compact_boundary）
      if (msg.subtype === "init" || msg.subtype === "compact_boundary") {
        return null;
      }
      // status / local_command_output / hook_* / task_* / files_persisted / elicitation_complete → 事件流
      return { kind: "event", event: { id: msg.uuid ?? crypto.randomUUID(), ...msg } };
    }
    default: {
      return null;
    }
  }
}
```

---

## 附录 B：TODO — SDKPartialAssistantMessage 流式支持

当前只处理 `SDKAssistantMessage`（完整消息），把 content block 拆成 start/delta/end 模拟流式。
启用 `includePartialMessages: true` 后，可以用 `SDKPartialAssistantMessage`（stream_event）做真正逐 token 推送。

### 转换策略

```
stream_event (message_start)                    ← start-step，重置 contentBlocks 状态
stream_event (content_block_start type=text)     ← text-start id=String(index)
stream_event (content_block_delta type=text)     ← text-delta id=String(index)
stream_event (content_block_stop)                ← text-end id=String(index)
stream_event (content_block_start type=thinking) ← reasoning-start id=String(index)
stream_event (content_block_delta type=thinking) ← reasoning-delta id=String(index)
stream_event (content_block_stop)                ← reasoning-end id=String(index)
stream_event (content_block_start type=tool_use) ← tool-input-start id=block.id
stream_event (content_block_delta type=input_json) ← tool-input-delta
stream_event (content_block_stop)                ← tool-input-end + tool-call(完整 input)
stream_event (message_stop)                      ← (LLM 调用结束)
assistant (完整消息)                              ← 跳过 text/thinking（已流过），仅校验
user (tool_result)                               ← tool-output-available（不触发 finish-step）
result                                           ← finish-step + finish
```

### 实现要点

1. **状态管理**：维护 `contentBlocks: Record<number, BlockState>` 跟踪每个 index 的 block 类型和累积数据
2. **message_start 重置**：每次收到 message_start 事件，重置 contentBlocks，emit start-step
3. **id 规则**：text/reasoning 用 `String(index)`，tool 用 `block.id`（与 AI SDK anthropic provider 一致）
4. **tool input 累积**：input_json_delta 追加到 contentBlock.input，content_block_stop 时发完整 tool-call
5. **assistant 消息退化**：stream_event 已经处理了 text/thinking，assistant 消息只用于补充/校验完整 tool input
6. **开关控制**：query options 加 `includePartialMessages: true`
