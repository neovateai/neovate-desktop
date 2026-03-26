# Content Panel Width Elasticity

**Date:** 2026-03-26
**Status:** Draft

## Requirement

当 `contentPanel` 展开时，如果用户展开/收起 `primarySidebar` 或 `secondarySidebar`：

- **只影响 `contentPanel` 的宽度**
- 其他面板（如 `chatPanel`）宽度保持不变

当 `contentPanel` 收起时，恢复原有布局逻辑。

## Current Behavior

当前布局的面板宽度分配逻辑：

1. 面板布局顺序：`primarySidebar` → `chatPanel` → `contentPanel` → `secondarySidebar`
2. `chatPanel` 使用 `flex-1`，占据剩余可用空间
3. 当侧边面板展开/收起时，`chatPanel` 宽度会相应变化

## Problem

当 `contentPanel` 展开后：

- 用户展开 `primarySidebar` 时，`chatPanel` 和 `contentPanel` 都会被压缩
- 用户展开 `secondarySidebar` 时，`chatPanel` 和 `contentPanel` 都会被压缩
- 这导致 `chatPanel`（主要对话区域）宽度不稳定，影响阅读体验

## Proposed Design

### 核心思路

引入"面板组"概念，将面板分为两组：

```
[固定宽度组] ←→ [弹性宽度组]
```

- **固定宽度组**：`primarySidebar`, `secondarySidebar` — 展开/收起时宽度变化固定
- **弹性宽度组**：`chatPanel`, `contentPanel` — 吸收固定宽度组的变化

当 `contentPanel` **展开**时：

- `primarySidebar` / `secondarySidebar` 的宽度变化**只影响 `contentPanel`**
- `chatPanel` 宽度保持不变

当 `contentPanel` **收起**时：

- 沿用现有逻辑（`chatPanel` 吸收所有变化）

### 行为设计

#### 1. `contentPanel` 展开状态下的面板交互

| 操作                         | 影响的面板宽度                            |
| ---------------------------- | ----------------------------------------- |
| 展开 `primarySidebar`        | `contentPanel` 缩小，`chatPanel` 不变     |
| 收起 `primarySidebar`        | `contentPanel` 扩大，`chatPanel` 不变     |
| 展开 `secondarySidebar`      | `contentPanel` 缩小，`chatPanel` 不变     |
| 收起 `secondarySidebar`      | `contentPanel` 扩大，`chatPanel` 不变     |
| 调整 `primarySidebar` 宽度   | `contentPanel` 反向调整，`chatPanel` 不变 |
| 调整 `secondarySidebar` 宽度 | `contentPanel` 反向调整，`chatPanel` 不变 |

#### 2. `contentPanel` 收起状态下的面板交互

保持现有逻辑：

- `chatPanel` 作为弹性面板，吸收所有宽度变化

### 技术实现

#### 方案：修改 `applyDelta` 和 `shrinkPanelsToFit` 的收缩目标选择

当前逻辑中，`applyDelta` 在拖拽 resize handle 时会按优先级收缩面板：

```typescript
// 当前逻辑
function applyDelta(panels, separatorIndex, delta) {
  // 向左拖：收缩左侧面板，扩大右侧面板
  // 向右拖：收缩右侧面板，扩大左侧面板
  // 收缩目标按 overflow.priority 排序
}
```

需要在 `contentPanel` 展开时，修改收缩目标的优先级：

1. 当拖拽 `primarySidebar:chatPanel` 分隔线时：
   - 如果 `contentPanel` 展开，优先收缩 `contentPanel` 而非 `chatPanel`

2. 当拖拽 `chatPanel:contentPanel` 分隔线时：
   - 保持现有逻辑

3. 当拖拽 `contentPanel:secondarySidebar` 分隔线时：
   - 保持现有逻辑

#### 状态设计（可选）

如果需要更精确的控制，可以添加状态标记：

```typescript
type LayoutStore = {
  // ... existing fields

  /**
   * Whether contentPanel is currently expanded.
   * Used to determine which panel should absorb width changes.
   */
  isContentPanelExpanded: boolean;
};
```

但更推荐的方式是直接从 `panels.contentPanel.collapsed` 读取状态，避免状态冗余。

### 实现位置

1. **`layout-coordinator.ts`** - 修改 `applyDelta` 函数
   - 添加参数 `ctx: { contentPanelExpanded: boolean }`
   - 根据 `contentPanelExpanded` 调整收缩优先级

2. **`store.ts`** - 在 `startResize` 时传入上下文
   - 将 `contentPanel.collapsed` 状态传递给 resize 逻辑

## Alternative Designs

### Alternative 1: 固定 `chatPanel` 宽度

在 `contentPanel` 展开时，临时将 `chatPanel` 设为固定宽度：

```typescript
if (!panels.contentPanel.collapsed) {
  // chatPanel 宽度固定，contentPanel 吸收变化
  chatPanel.overflow.priority = 0; // 最低优先级
  contentPanel.overflow.priority = 2;
}
```

**优点**：实现简单
**缺点**：需要动态修改面板描述符，可能引入状态同步问题

### Alternative 2: 引入新的面板组概念

将面板分为两组，组内优先级相同，组间优先级不同：

```typescript
type PanelGroup = "fixed" | "elastic";

const PANEL_GROUPS = {
  primarySidebar: "fixed",
  chatPanel: "elastic",
  contentPanel: "elastic",
  secondarySidebar: "fixed",
};
```

**优点**：扩展性好，未来可以支持更多分组
**缺点**：实现复杂度较高

### Alternative 3: Resize 时动态计算

在 `startResize` 时，根据当前面板状态动态计算收缩优先级：

```typescript
function getShrinkTargets(separatorIndex, delta, panels) {
  if (!panels.contentPanel.collapsed) {
    // contentPanel 展开，优先收缩它
    return ["contentPanel", ...otherPanels];
  }
  return defaultPriority;
}
```

**优点**：按需计算，无额外状态
**缺点**：每次 resize 都需要重新计算

## Recommendation

推荐使用 **Alternative 3**（动态计算），原因：

1. 实现简单，只需修改 `applyDelta` 函数
2. 无额外状态，避免状态同步问题
3. 扩展性好，未来可以支持更多类似行为

## Implementation Plan

1. 修改 `applyDelta` 函数，添加对 `contentPanel` 状态的判断
2. 在 `contentPanel` 展开时，调整收缩优先级
3. 添加测试验证行为
4. 更新相关文档
