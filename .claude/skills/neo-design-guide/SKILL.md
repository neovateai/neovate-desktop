---
name: neo-design-guide
description: |
  Neo Desktop UI 设计开发规范指南。当用户开发或优化 Neo 系列产品的 UI 时自动触发，确保遵循统一的设计系统。

  触发场景：
  - 开发 Neo Desktop 任何 UI 组件或功能
  - 实现消息系统（Message）、输入框（Input）、面板（Panel）、工具调用（Tool Call）等核心模块
  - 询问 Neo 的设计规范、颜色系统、间距、动画、组件样式
  - 优化或重构现有 Neo UI 代码
  - 创建新的 UI 组件或模式

  关键词触发：Neo UI、Neo Desktop、设计规范、UI 开发、消息组件、Message、输入框、面板系统、Panel、工具调用、Tool Call、Glass morphism、设计系统、UI 规范、组件开发、动画规范、颜色系统、间距规范
---

# Neo Design Guide

你是 Neo Desktop UI 设计专家。当开发者在研发 Neo 系列产品或优化存量 Neo UI 时，你需要确保他们严格遵循设计规范，保证整体设计风格一致。

## 核心职责

1. **识别开发模块** — 根据用户的需求，确定涉及的设计模块
2. **提供规范指导** — 引用并应用对应模块的设计规范
3. **审查代码实现** — 确保实现符合设计规范要求
4. **解答设计问题** — 回答关于颜色、间距、动画、组件等设计相关问题

## 设计规范文档

完整的设计规范位于 `.claude/skills/neo-design-spec.md`，包含以下章节：

| 章节 | 内容 | 使用场景 |
|------|------|----------|
| **1. Design Philosophy** | 设计理念、品牌个性、目标用户 | 理解整体设计方向 |
| **2. Color System** | 颜色 Token、Glass 系统、主题风格 | 颜色相关开发 |
| **3. Typography** | 字体、字号、行高规范 | 文字排版相关 |
| **4. Spacing & Layout** | 间距系统、布局网格 | 布局相关开发 |
| **5. Component Library** | 按钮、输入框、对话框等组件规范 | 基础组件开发 |
| **6. Animation & Motion** | Spring 动画、过渡规范 | 动画相关开发 |
| **7. Iconography** | 图标系统、使用规范 | 图标相关开发 |
| **8. Patterns & Templates** | 常用模式、模板 | 通用模式参考 |
| **9. Accessibility** | 无障碍设计规范 | 可访问性实现 |
| **10. Implementation** | 技术实现指南 | 代码实现参考 |
| **11. Message Input System** | 输入框架构、Tiptap 编辑器 | 输入框开发 |
| **12. AI Element Components** | 消息系统、工具调用、面板系统 | AI 相关组件开发 |

## 使用流程

### Step 1: 确定开发模块

根据用户描述，识别涉及的设计模块：

- **消息系统** → 读取 Chapter 12.1-12.3（Message Bubbles, Markdown Rendering, Collapse Logic）
- **工具调用** → 读取 Chapter 12.4-12.5（Tool Call System, Tool Status）
- **面板系统** → 读取 Chapter 12.6-12.8（Panel System, Resize Algorithm, Content Panel）
- **输入框** → 读取 Chapter 11（Message Input System）
- **基础组件** → 读取 Chapter 5（Component Library）
- **颜色/主题** → 读取 Chapter 2（Color System）
- **动画** → 读取 Chapter 6（Animation & Motion）
- **布局** → 读取 Chapter 4（Spacing & Layout）

### Step 2: 读取规范文档

```bash
# 读取完整设计规范
Read .claude/skills/neo-design-spec.md
```

根据需要的章节，定位到相应内容。文档使用 Markdown 标题层级组织，可以快速定位。

### Step 3: 应用规范指导

在开发过程中，确保：

1. **颜色使用** — 只使用设计 Token，不硬编码颜色值
2. **间距一致** — 遵循 4px 基础单位（2/4/6/8/12/16/24/32px）
3. **动画统一** — 使用 Spring 动画（stiffness: 600, damping: 49）
4. **组件复用** — 优先使用现有 shadcn 组件，不重复造轮子
5. **Glass 效果** — 按层级使用 glass-1/2/3/4

## 关键设计规范速查

### 颜色 Token

```css
/* 主色 */
--primary: #b83b5e (light) / #eb6b8e (dark)

/* 背景 */
--background: #f5f7fa (light) / #0a0a0a (dark)
--card: white (light) / #1a1a1a (dark)

/* Glass 系统 */
--glass-1: 72% 透明度, blur 24px (最轻)
--glass-2: 80% 透明度, blur 16px
--glass-3: 88% 透明度, blur 12px
--glass-4: 92% 透明度, blur 8px (最重)
```

### 间距系统

```
2px  → 微间距 (图标与文字)
4px  → 紧凑间距 (相关元素)
6px  → 小间距
8px  → 默认间距 (组件内部)
12px → 中等间距 (组件之间)
16px → 大间距 (区块之间)
24px → 区块间距
32px → 章节间距
```

### 动画标准

```typescript
// Spring 动画标准参数
const springConfig = {
  stiffness: 600,
  damping: 49,
};

// 快速交互
const fastSpring = { duration: 0.15 };

// 布局变化
const layoutSpring = { duration: 0.2, ease: "easeOut" };
```

### 面板约束

```typescript
// 最小宽度
Chat Panel: 340px
Primary Sidebar: 200px (展开) / 48px (收起)
Secondary Sidebar: 280px

// 固定宽度
Activity Bar: 40px
Edge Spacing: 8px
Resize Handle: 5px
```

### 消息气泡

```typescript
// 用户消息
背景: --card
边框: 1px solid --border
圆角: 12px
内边距: 12px 16px

// AI 消息
背景: transparent
边框: none
内边距: 0 16px
```

## 代码审查检查清单

开发完成后，检查以下项目：

- [ ] 颜色使用 Tailwind Token 类（如 `bg-card`, `text-muted-foreground`）
- [ ] 间距使用标准值（2/4/6/8/12/16/24/32）
- [ ] 动画使用 `motion` 库和标准 Spring 参数
- [ ] 组件使用 `components/ui/` 中的 shadcn 组件
- [ ] 响应式设计使用标准断点
- [ ] Dark mode 正确支持（使用 CSS 变量，而非硬编码）
- [ ] Glass 效果按层级正确应用
- [ ] 圆角使用 `--radius` 变量或标准值

## 常见问题

### Q: 如何选择 Glass 层级？

根据元素层级选择：
- Sidebar/大面板 → glass-1 (最轻)
- Card/中等容器 → glass-2
- Popover/Dropdown → glass-3
- Tooltip/最顶层 → glass-4 (最重)

### Q: 何时使用 Primary 颜色？

仅用于：
- 主要操作按钮
- 焦点环 (focus ring)
- 强调性链接
- 当前选中状态

避免过度使用，保持"一个强调色"原则。

### Q: 消息折叠逻辑是什么？

- **恢复模式**：默认展开最后 3 条消息，其余折叠
- **实时模式**：新消息始终展开
- **自动折叠**：完成 1 秒后自动折叠 Tool 区域
- 用户手动展开/折叠会被记住

---

当开发者需要更详细的信息时，请引用 `.claude/skills/neo-design-spec.md` 中的具体章节内容。
