# Claude Agent SDK Task / SubAgent 消息聚合设计

## 1. 设计结论

本设计文档同时给出两个层次：

1. **MVP 方案**
   - 本期推荐实现
   - 目标是先让 `Task` / `Agent` 的 `tool-output-available` 能持续更新同一张卡片
   - 不要求先把整套抽象全部落完

2. **完整版方案**
   - 保留为后续演进目标
   - 在 MVP 跑通后，再把现有复用关系正式抽象成通用 helper / adapter / materializer

这样做的原因很简单：

- 不能只保留 MVP，否则会把前面已经确认清楚的复用边界和演进方向丢掉
- 也不能一上来就按完整版全部改完，否则第一版复杂度会明显抬高

### 1.1 MVP 方案

MVP 的真实集成点不是 AI SDK 官方文档里那种 `tool async function* execute(...)` 子代理运行时，而是当前仓库已经存在的链路：

```text
Claude Agent SDK message
  -> SDKMessageTransformer.transform(...)
  -> UIMessageChunk
```

也就是说，本期要做的是：

1. 保持 `SDKMessageTransformer` 仍然是核心集成点
2. 当父工具是 `Task` / `Agent` 时，记录它的 `toolCallId`
3. 将 `parent_tool_use_id === toolCallId` 的 child Claude SDK messages 缓存在该父工具下
4. 每次 child message 到来时，复用现有 `UIMessageChunk -> UIMessage` 路径，把当前 child transcript replay 成最新的 agent `UIMessage`
5. 用同一个 `toolCallId` 持续发新的 `tool-output-available`
6. 前端优先渲染 `part.output.message`，旧的 sibling regroup 仅作为 fallback

MVP 推荐的输出形态是：

```ts
{
  type: "tool-output-available",
  toolCallId,
  output: {
    kind: "ui-message",
    message: agentMessage,
    status: "streaming",
  },
  providerExecuted: true,
  preliminary: true,
}
```

父工具结束时，再发一次最终更新：

```ts
{
  type: "tool-output-available",
  toolCallId,
  output: {
    kind: "ui-message",
    message: agentMessage,
    summary,
    status: "done",
  },
  providerExecuted: true,
  preliminary: false,
}
```

MVP 里明确**不先做**这些事：

- 不先手写新的本地 accumulator
- 不先把整个 transformer 全面 async 化
- 不先引入一套独立的复杂聚合框架

### 1.2 完整版方案

完整版依然有价值，而且应该保留在文档里。它解决的是两个更长期的问题：

1. 把已经存在的两段能力正式抽象出来
   - `SDKMessage -> UIMessageChunk`
   - `UIMessageChunk -> UIMessage`
2. 让 history replay、agent replay、将来可能的增量优化共用同一条稳定语义链路

完整版的方向仍然是：

1. **低层翻译器**
   - `SDKMessage -> UIMessageChunk[]`
   - 继续复用当前 `SDKMessageTransformer` 里的核心映射逻辑

2. **流适配器**
   - `Iterable<SDKMessage> | AsyncIterable<SDKMessage> -> ReadableStream<UIMessageChunk>`
   - 使用 AI SDK 的 `createUIMessageStream(...)`

3. **消息物化器**
   - `Iterable<SDKMessage> | AsyncIterable<SDKMessage> -> Promise<UIMessage | undefined>`
   - 使用上面的 stream adapter，再走 AI SDK 的 `readUIMessageStream(...)`

4. **Task/SubAgent 聚合层**
   - 识别 Claude Agent SDK 消息中的 `parent_tool_use_id`
   - 对属于某个 `Task` / `Agent` 的子消息做局部 replay
   - 将 replay 出来的 agent `UIMessage` 放进父工具的 `tool-output-available` chunk

### 1.3 最终建议

一句话概括：

```text
MVP 先落地持续更新的 tool-output-available；
完整版保留为后续把 replay / materialize 逻辑正式抽象出来的演进方向。
```

再换一句更工程化的话：

```text
不要手写第三套协议。
先复用已有能力把最小可工作的父子聚合跑通，再把复用关系抽象稳定。
```

## 2. 背景与问题

当前真实链路是：

```text
Claude Agent SDK query()
  -> SessionManager.stream()
  -> SDKMessageTransformer.transform(value)
  -> ClaudeCodeUIMessageChunk
  -> ClaudeCodeChatTransport.sendMessages()
  -> AbstractChat
  -> UIMessage[]
```

也就是说：

- 后端对前端发送的是 `UIMessageChunk`
- 前端 `AbstractChat` 负责把顶层 chunk 累积为 `messages: UIMessage[]`
- Claude Agent SDK 的层级关系来自原始消息字段 `parent_tool_use_id`
- AI SDK 并不会自动理解这些层级语义

当前 UI 的 Task / Agent 卡片渲染方式是：

- 顶层消息先被平铺成一个 `UIMessage`
- 再在 React 组件里通过 `callProviderMetadata?.claudeCode?.parentToolUseId`
- 从同一条顶层消息的 sibling parts 里捞出“子工具”

这个方案的问题很明确：

1. 只能自然归组 child tool parts，不能自然归组 child text / reasoning
2. 父子结构存在于 provider metadata，不存在于 tool output 本身
3. live stream 与 history replay 的结构语义并不完全一致
4. 越往深层嵌套，React 侧 regroup 越脆弱

## 3. 已有可复用能力

这件事最关键的前提是：**仓库里其实已经有两段可复用的能力，只是还没有被正式抽象出来。**

### 3.1 `SDKMessage -> UIMessageChunk`

当前 [sdk-message-transformer.ts](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/main/features/agent/sdk-message-transformer.ts) 已经负责把 Claude Agent SDK 消息翻译成 AI SDK chunk：

- `assistant -> text-* / reasoning-* / tool-input-available`
- `user tool_result -> tool-output-available / tool-output-error`
- `stream_event -> text-start / text-delta / tool-input-delta ...`
- `result -> finish-step / finish / error`

这是第一段现成能力。

### 3.2 `UIMessageChunk -> UIMessage`

当前 [session-messages-to-ui-messages.ts](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/main/features/agent/utils/session-messages-to-ui-messages.ts#L24) 已经用了一次完整的 replay 路径：

1. `createUIMessageStream(...)`
2. 把 transformer 产出的 chunk `writer.write(...)`
3. `readUIMessageStream(...)`
4. 取最后一个 `UIMessage`

这说明仓库里已经有第二段现成能力，只是目前只在 history replay 里用。

### 3.3 AI SDK 本身支持 async execute

本地 AI SDK 源码表明，`createUIMessageStream(...)` 的 `execute` 可以返回 `Promise<void>`：

- 本地文件：
  - [create-ui-message-stream.ts](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/node_modules/.bun/ai@6.0.116+3c5d820c62823f0b/node_modules/ai/src/ui-message-stream/create-ui-message-stream.ts)

这意味着我们完全可以把“消息集合 -> UIMessageStream”的适配器写成异步版本，用 `for await` 驱动。

## 4. 设计目标

1. 复用已有的 `SDKMessage -> UIMessageChunk` 逻辑
2. 复用已有的 `UIMessageChunk -> UIMessage` 逻辑
3. 避免在第一版里手写新的复杂 accumulator
4. 让 Task/SubAgent 聚合成为一个建立在通用抽象之上的特例
5. 让 live stream 与 history replay 使用同一条语义链路
6. 保持对外协议不变，仍然输出 `ClaudeCodeUIMessageChunk`

## 5. 非目标

1. 本期不重写 AI SDK 的 `processUIMessageStream`
2. 本期不引入新的 RPC 端点或 transport 协议
3. 本期不把所有 Claude 工具都变成“可折叠聚合容器”
4. 本期不追求零 replay 成本的最优性能实现

## 6. 备选方案

### 6.1 方案 A：手写本地 accumulator

路径：

```text
child SDKMessage
  -> child transformer
  -> child chunks
  -> 自己写的 accumulator
  -> agent UIMessage snapshot
```

优点：

- 运行时高效
- 不需要 replay 已有 child messages

缺点：

- 第一版实现成本高
- 很容易和 AI SDK 的 `processUIMessageStream` 语义偏离
- 需要自己覆盖 text、reasoning、tool、approval、step 边界

### 6.2 方案 B：统一抽象 + replay materializer

路径：

```text
child SDKMessages[]
  -> sdkMessagesToUIMessageStream(...)
  -> readUIMessageStream(...)
  -> latest UIMessage
```

优点：

- 最大化复用现有逻辑
- 正确性最容易对齐 AI SDK
- live path 与 replay path 共享同一套语义
- 抽象边界最清晰

缺点：

- child transcript 每次更新都要 replay
- 很长的子流程会有额外成本

### 6.3 方案 C：直接把整个 transformer 全面 async 化

路径：

- 所有 `transform(msg)` 内部都走 async / stream API
- 放弃同步单消息翻译边界

优点：

- 理论上更统一

缺点：

- 影响面过大
- 把“普通消息翻译”和“Task 聚合重放”两个复杂度绑在一起
- 对现有测试和调用方改动更大

## 7. 选定方案

选择 **方案 B 的语义方向**，但实现顺序拆成两层：

### 7.1 本期先落地 MVP

本期不把“完整版抽象”作为前置条件，而是优先交付下面这个最小闭环：

1. `Task` / `Agent` 父工具出现时记录 `toolCallId`
2. child message 按 `parent_tool_use_id` 缓存在父工具下
3. 每次 child message 到来时，把当前 child transcript replay 成 agent `UIMessage`
4. 用同一个 `toolCallId` 持续发 `tool-output-available`
5. 前端优先渲染 `part.output.message`

MVP 的核心判断标准不是“抽象是否优雅”，而是：

- 同一个 Task/Agent 卡片能持续更新
- child text / reasoning / tools 都能跟着更新
- live stream 和历史回放不会再依赖 React 侧 sibling regroup 作为唯一主路径

### 7.2 完整版保留为演进目标

在 MVP 验证正确后，再将下面这些关系正式沉淀成稳定抽象：

1. 保留当前低层单消息翻译逻辑
2. 在其上抽象通用的 async stream adapter
3. 再在其上抽象通用的 message materializer
4. Task/SubAgent 聚合层复用上述抽象
5. 若后续性能证明有必要，再把 materializer 内部替换成 accumulator
6. 对外协议保持不变

这意味着：

- 第一阶段优先正确性、最小改动和可落地性
- 第二阶段再追求抽象统一和更强的复用边界
- Task 聚合层未来可以无感切换 replay 或 accumulator 实现

## 8. 完整版核心抽象（演进目标，不是 MVP 前置）

### 8.1 Layer 1: `SDKMessage -> UIMessageChunk[]`

保留 `SDKMessageTransformer` 作为最底层翻译器。

建议把内部逻辑分成两层：

```ts
class SDKMessageTransformer {
  transformMessageSync(msg: SDKMessage): Iterable<ClaudeCodeUIMessageChunk>;

  async *transform(msg: SDKMessage): AsyncGenerator<ClaudeCodeUIMessageChunk> {
    for (const chunk of this.transformMessageSync(msg)) {
      yield chunk;
    }
  }
}
```

说明：

- `transformMessageSync(...)` 承载当前绝大多数现有逻辑
- `transform(...)` 成为对外统一入口
- 这样普通路径仍然是同步翻译
- 但调用方以后可以统一 `for await`

这一步不是为了强行异步，而是为了给上层聚合层留 `await` 空间。

### 8.2 Layer 2: `SDKMessages -> UIMessageStream`

新增一个通用适配器：

```ts
function sdkMessagesToUIMessageStream(
  messages: Iterable<SDKMessage> | AsyncIterable<SDKMessage>,
  options?: {
    transformer?: SDKMessageTransformer;
  },
): ReadableStream<ClaudeCodeUIMessageChunk>;
```

实现方式：

```ts
return createUIMessageStream<ClaudeCodeUIMessage>({
  async execute({ writer }) {
    const transformer = options?.transformer ?? new SDKMessageTransformer();

    for await (const message of toAsyncIterable(messages)) {
      for await (const chunk of transformer.transform(message)) {
        writer.write(chunk);
      }
    }
  },
});
```

这层做的事情很简单：

- 统一接收同步或异步的 Claude SDK 消息集合
- 统一复用 transformer
- 统一产出 AI SDK 兼容的 `ReadableStream<UIMessageChunk>`

### 8.3 Layer 3: `SDKMessages -> UIMessage`

新增一个通用物化器：

```ts
async function sdkMessagesToUIMessage(
  messages: Iterable<SDKMessage> | AsyncIterable<SDKMessage>,
  options?: {
    transformer?: SDKMessageTransformer;
    message?: ClaudeCodeUIMessage;
  },
): Promise<ClaudeCodeUIMessage | undefined>;
```

实现方式：

```ts
const stream = sdkMessagesToUIMessageStream(messages, options);
const messageStream = readUIMessageStream<ClaudeCodeUIMessage>({
  stream,
  message: options?.message,
});

let last: ClaudeCodeUIMessage | undefined;
for await (const msg of messageStream) {
  last = msg;
}
return last;
```

这一层的价值很大：

- history replay 可以直接复用
- child Task transcript 的 replay 也可以直接复用
- 测试可以直接断言最终 `UIMessage`

### 8.4 Layer 4: `TaskSubagentAggregator`

在上述通用抽象之上，实现 Task/SubAgent 聚合器：

```ts
type AggregatedToolOutput = {
  kind: "ui-message";
  message: ClaudeCodeUIMessage;
  summary?: string | { type: "text"; text: string }[];
  status: "streaming" | "done" | "error";
  errorText?: string;
};

type AggregationState = {
  toolCallId: string;
  toolName: "Task" | "Agent";
  childMessages: SDKMessage[];
  latestMessage?: ClaudeCodeUIMessage;
  summary?: string | { type: "text"; text: string }[];
  status: "streaming" | "done" | "error";
  errorText?: string;
};
```

聚合器不负责底层 chunk 细节。它只负责：

1. 发现哪条 Claude SDK 消息属于哪个父 `Task` / `Agent`
2. 把 child messages 按 toolCallId 缓存
3. 需要更新时调用 `sdkMessagesToUIMessage(...)`
4. 再产出一个新的顶层 `tool-output-available`

## 9. 路由规则

### 9.1 普通消息

如果一条消息不属于任何聚合中的 `Task` / `Agent`：

- 直接走 `transformMessageSync(...)`
- 输出顶层 chunk

### 9.2 父 `Task` / `Agent` tool_use 出现

当 transformer 看到：

- `toolName === "Task"` 或 `toolName === "Agent"`

时：

1. 照常输出顶层的 `tool-input-start` / `tool-input-delta` / `tool-input-available`
2. 同时创建一条 `AggregationState`

### 9.3 子消息命中聚合

当 Claude SDK 消息满足：

```ts
msg.parent_tool_use_id === aggregation.toolCallId;
```

则：

1. 这条消息不直接变成顶层 chunk
2. 而是 `aggregation.childMessages.push(msg)`
3. 调用：

```ts
aggregation.latestMessage = await sdkMessagesToUIMessage(aggregation.childMessages, {
  transformer: new SDKMessageTransformer(/* agent context */),
});
```

4. 然后向顶层输出：

```ts
yield {
  type: "tool-output-available",
  toolCallId: aggregation.toolCallId,
  output: {
    kind: "ui-message",
    message: aggregation.latestMessage,
    summary: aggregation.summary,
    status: "streaming",
  },
  providerExecuted: true,
  preliminary: true,
};
```

这一步非常重要：

- **transform 最终发出去的仍然是 `UIMessageChunk`**
- 只是这个 chunk 的 `output` 字段里包了一个已经物化好的 agent `UIMessage`

### 9.4 父工具结束

当父工具对应的 `tool_result` 到来时：

- 成功：
  - 更新 `summary`
  - `status = "done"`
  - 再发一次 `tool-output-available`
  - `preliminary: false`

- 失败：
  - 若尚无 child transcript，维持当前 `tool-output-error`
  - 若已有 child transcript，发一个最终 `tool-output-available`
  - `status = "error"`
  - `errorText` 带上 Claude 返回内容

这样 UI 还能保留已经完成的子流程内容。

## 10. Nested Context 规范

如果直接把 child messages 原样 replay，存在一个上下文问题：

- 对 child replay 来说，`parent_tool_use_id === <root task toolCallId>` 表示“这是这个 agent transcript 的根”
- 但对顶层 replay 来说，这个字段表示“它挂在某个父工具下”

因此 materializer 需要支持一个轻量 agent context：

```ts
type SDKMessageTransformContext = {
  rootParentToolUseId?: string | null;
};
```

语义：

- 当 replay agent transcript 时
- 若 `msg.parent_tool_use_id === rootParentToolUseId`
- 则将其视为当前 agent replay 的根层消息

这样做的目的不是修改原始数据，而是避免 direct child transcript 在 agent replay 中再次被当成“外部挂载消息”。

这个 context 只影响 replay/materialize 视角，不影响原始 Claude SDK message。

## 11. 对前端渲染的影响

前端的目标结构改为：

- `tool-Task` / `tool-Agent` 卡片主要看 `part.output`
- `part.output.kind === "ui-message"` 时，递归渲染 `part.output.message.parts`
- `part.output.summary` 作为补充总结
- `part.output.status` 控制 loading / done / error 样式

也就是说，主读取路径从：

```ts
message.parts -> sibling regroup by parentToolUseId
```

迁移为：

```ts
tool part -> output.message.parts
```

旧的 sibling regroup 逻辑短期保留为历史兼容 fallback。

## 12. 为什么 MVP 不先写 accumulator

因为我们已经有：

- `SDKMessage -> UIMessageChunk`
- `UIMessageChunk -> UIMessage`

如果在 MVP 阶段再手写一个本地 accumulator，会重复实现第二段能力，而且容易偏离 AI SDK 语义。

更稳的演进顺序是：

1. 先用已有 replay 路径把 MVP 跑通
2. 再把“translator + stream adapter + materializer”三层抽象正式收敛出来
3. 让 Task/SubAgent 聚合建立在这个稳定抽象上
4. 观察长 transcript 的实际性能
5. 如果 replay 成本真实成为问题，再把 `sdkMessagesToUIMessage(...)` 的内部引擎换成 accumulator

这里的关键是：

**先用 MVP 验证结构，再决定何时把接口抽象稳定，以及内部实现是不是 replay。**

## 13. 推荐的接口草案

### 13.1 Transformer

```ts
class SDKMessageTransformer {
  constructor(context?: SDKMessageTransformContext);

  transformMessageSync(msg: SDKMessage): Iterable<ClaudeCodeUIMessageChunk>;

  transform(msg: SDKMessage): AsyncGenerator<ClaudeCodeUIMessageChunk>;
}
```

### 13.2 Stream Adapter

```ts
function sdkMessagesToUIMessageStream(
  messages: Iterable<SDKMessage> | AsyncIterable<SDKMessage>,
  options?: {
    transformer?: SDKMessageTransformer;
  },
): ReadableStream<ClaudeCodeUIMessageChunk>;
```

### 13.3 Materializer

```ts
async function sdkMessagesToUIMessage(
  messages: Iterable<SDKMessage> | AsyncIterable<SDKMessage>,
  options?: {
    transformer?: SDKMessageTransformer;
    message?: ClaudeCodeUIMessage;
  },
): Promise<ClaudeCodeUIMessage | undefined>;
```

### 13.4 Aggregator

```ts
class TaskSubagentAggregator {
  onToolStart(toolCallId: string, toolName: "Task" | "Agent"): void;

  onChildMessage(
    parentToolCallId: string,
    msg: SDKMessage,
  ): Promise<AggregatedToolOutput | undefined>;

  onToolResult(
    toolCallId: string,
    result: unknown,
    isError: boolean,
  ): Promise<AggregatedToolOutput | "tool-output-error" | undefined>;
}
```

## 14. 数据流

### 14.1 顶层 live stream

```text
Claude query.next()
  -> SessionManager.stream()
  -> for await (const chunk of transformer.transform(value))
  -> yield chunk
```

### 14.2 Nested Task replay

```text
child Claude messages[]
  -> sdkMessagesToUIMessageStream(...)
  -> readUIMessageStream(...)
  -> latest agent UIMessage
  -> parent tool-output-available chunk
```

### 14.3 History replay

```text
session messages[]
  -> sdkMessagesToUIMessageStream(...)
  -> readUIMessageStream(...)
  -> final UIMessage
```

重要的是：

**history replay 和 agent replay 现在走的是同一条语义链路。**

## 15. 迁移计划

### Phase 1: MVP 后端聚合

1. 在 `SDKMessageTransformer` 或其最小配套 helper 中识别 `Task` / `Agent` 父工具
2. 按 `toolCallId` 缓存 child Claude SDK messages
3. 每次 child message 到来时，复用现有 replay 链路得到最新 agent `UIMessage`
4. 用同一个 `toolCallId` 持续发 `tool-output-available`
5. 父工具 `tool_result` 到来时，发最终一次 `tool-output-available`

### Phase 2: MVP 前端渲染

1. `AgentTool` / `TaskTool` 优先渲染 `part.output.message`
2. 旧 sibling regroup 保留为 fallback，兼容历史消息和未迁移数据
3. 补充持续更新场景下的 UI 测试

### Phase 3: 完整版抽象收敛

1. 将 `SDKMessageTransformer` 暴露为 async 入口
2. 新增 `sdkMessagesToUIMessageStream(...)`
3. 新增 `sdkMessagesToUIMessage(...)`
4. 让 [session-messages-to-ui-messages.ts](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/main/features/agent/utils/session-messages-to-ui-messages.ts) 改为复用这两个 helper
5. 如有必要，再将 MVP 中的局部 replay 逻辑抽到独立聚合器

### Phase 4: 性能优化

1. 测量长 transcript 的 replay 成本
2. 若需要，引入 `IncrementalUIMessageMaterializer` 或本地 accumulator
3. 保持 `sdkMessagesToUIMessage(...)` 接口不变

## 16. 测试策略

### 16.1 单元测试

- `SDKMessageTransformer` 现有测试继续覆盖单消息翻译
- 为 `sdkMessagesToUIMessage(...)` 增加 golden tests
- 输入同一组 `SDKMessage[]`
- 断言输出 `UIMessage` 与当前 `readUIMessageStream` 结果一致

### 16.2 聚合测试

- `Task` 开始后，child message 更新会覆盖同一个 `toolCallId`
- `preliminary: true` 时卡片不新增副本
- 父工具 `tool_result` 到来时，`summary` 和 `status` 正确
- 父工具失败时，已生成 transcript 不丢失

### 16.3 回归测试

- history replay 和 live stream 对同一 fixture 产出同结构
- 现有非 `Task` / `Agent` 工具行为不变

## 17. 风险与权衡

### 17.1 replay 成本

这是选定方案的主要代价，但它是可测量且可替换的。

### 17.2 agent context 处理不清

如果 `rootParentToolUseId` 语义处理不稳，agent replay 可能出现错误归组。  
因此这部分必须先用 fixture 测试固定下来。

### 17.3 public API 过早固化

所以本设计只固化三层抽象，不固化 accumulator 实现。

## 18. 最终决策

本期采用“双层决策”：

1. **先实现 MVP**
2. **MVP 目标是让同一个 `Task` / `Agent` 的 `tool-output-available` 持续更新**
3. **MVP 复用现有 replay 路径产出 agent `UIMessage`，不先手写 accumulator**
4. **前端优先读取 `part.output.message`，旧 sibling regroup 仅作为 fallback**
5. **完整版抽象保留在本文中，作为下一阶段的正式演进方向**
6. **若后续性能证明 replay 成本过高，再在物化层内部替换为 accumulator**

这条路线兼顾了两件事：

- 第一版可以尽快落地，并且和当前仓库真实运行边界一致
- 前面已经澄清清楚的完整抽象和长期方向不会丢失

## 19. 参考与依据

以下资料均在 2026-03-13 查验。

### 官方文档

1. AI SDK UI Stream Protocol
   - https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol
   - 依据：
     - 客户端消费的是 `UIMessageChunk` 流

2. AI SDK UI `useChat`
   - https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat
   - 依据：
     - 顶层 `messages` 由 AI SDK 管理

3. AI SDK UI `readUIMessageStream`
   - https://ai-sdk.dev/docs/reference/ai-sdk-ui/read-ui-message-stream
   - 依据：
     - `UIMessageChunk` 可被物化为“同一条消息不断完成中的完整 `UIMessage`”

4. AI SDK UI Streaming Data
   - https://ai-sdk.dev/docs/ai-sdk-ui/streaming-data
   - 依据：
     - `data-*` 与消息历史结构不同

5. AI SDK Agents: Subagents
   - https://ai-sdk.dev/docs/agents/subagents
   - 依据：
     - 官方语义上允许 tool output 持续更新
   - 注意：
     - 该文档展示的是 tool execute runtime，不是本仓库的实现路径

### 官方源码 / 本地依赖源码

6. AI SDK `createUIMessageStream`
   - 本地：`node_modules/.bun/ai@6.0.116+3c5d820c62823f0b/node_modules/ai/src/ui-message-stream/create-ui-message-stream.ts`
   - 依据：
     - `execute` 支持 `Promise<void> | void`

7. AI SDK `readUIMessageStream`
   - 本地：`node_modules/.bun/ai@6.0.116+3c5d820c62823f0b/node_modules/ai/src/ui-message-stream/read-ui-message-stream.ts`
   - 依据：
     - 物化结果是同一条消息的不同完成态

8. AI SDK `processUIMessageStream`
   - 本地：`node_modules/.bun/ai@6.0.116+3c5d820c62823f0b/node_modules/ai/src/ui/process-ui-message-stream.ts`
   - 依据：
     - `tool-output-available` 按 `toolCallId` 更新已有 tool part
     - `preliminary` 会保留在 tool invocation 上

9. AI SDK `UIMessageChunk`
   - 本地：`node_modules/.bun/ai@6.0.116+3c5d820c62823f0b/node_modules/ai/src/ui-message-stream/ui-message-chunks.ts`
   - 依据：
     - `tool-output-available.output` 类型是 `unknown`

10. Claude Agent SDK types
    - 本地：`node_modules/.bun/@anthropic-ai+claude-agent-sdk@0.2.71+3c5d820c62823f0b/node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`
    - 依据：
      - `SDKAssistantMessage` / `SDKUserMessage` / `SDKPartialAssistantMessage` 都带 `parent_tool_use_id`

### GitHub Issues

11. `vercel/ai#8380` Correlating sub agent's message stream to its parent tool call
    - https://github.com/vercel/ai/issues/8380
    - 依据：
      - 顶层 child messages 不会自动关联回父 tool call

12. `vercel/ai#9021` Race Condition in UIMessageStream Merging Causes Frontend Parsing Crash on finish-step Chunks
    - https://github.com/vercel/ai/issues/9021
    - 依据：
      - 不应把多个 child streams 粗暴 merge 到顶层主流

13. `vercel/ai#9731` `convertToModelMessages` produces invalid `ModelMessage[]` when `providerMetadata` is present in UI parts
    - https://github.com/vercel/ai/issues/9731
    - 依据：
      - 不应长期把主结构语义压在 provider metadata 上

### 本仓库代码

14. [session-manager.ts](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/main/features/agent/session-manager.ts#L590)
    - 依据：
      - 顶层 live stream 当前逐条读取 Claude SDK 消息并产出 chunk

15. [sdk-message-transformer.ts](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/main/features/agent/sdk-message-transformer.ts#L27)
    - 依据：
      - 当前单消息翻译逻辑已存在

16. [session-messages-to-ui-messages.ts](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/main/features/agent/utils/session-messages-to-ui-messages.ts#L24)
    - 依据：
      - 当前 history replay 已经在复用 `transformer -> createUIMessageStream -> readUIMessageStream`

17. [agent-tool.tsx](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/renderer/src/features/agent/components/tool-parts/agent-tool.tsx#L22)
18. [task-tool.tsx](/Users/dinq/GitHub/neovateai/neovate-desktop/.worktrees/fix-subagent-message-renderer/packages/desktop/src/renderer/src/features/agent/components/tool-parts/task-tool.tsx#L22)
    - 依据：
      - 当前 UI 仍主要依赖 sibling regroup
