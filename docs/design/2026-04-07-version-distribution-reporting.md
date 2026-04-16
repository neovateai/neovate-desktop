# Brainstorm: Version Distribution Reporting

**Date:** 2026-04-07
**Status:** Accepted

## What We're Building

App 启动时在 Main 进程上报版本分布信息，包括 app version、platform、architecture。使用现有的 analytics track event 模式，定义一个新的 programmatic event `app.version.reported`。

**上报数据：**

| Field      | Source             | Example    |
| ---------- | ------------------ | ---------- |
| `version`  | `app.getVersion()` | `"1.2.3"`  |
| `platform` | `process.platform` | `"darwin"` |
| `arch`     | `process.arch`     | `"arm64"`  |

**触发时机：** 每次应用启动时上报一次。

**上报位置：** Main 进程（直接访问 Electron API，无需跨进程通信）。

## Why This Approach

### 方案 A: Track Event (Chosen)

在 `events.ts` 中定义 `app.version.reported` 事件 schema，MainApp 启动时调用 `analytics.track()`。Enterprise 消费者通过 analytics plugin 接收事件并转发到后端聚合。

- 完全复用现有 programmatic event 模式
- 改动最小（~3 个文件：events.ts、main app.ts、可能的 types）
- 与现有的 `app.main-window.foregrounded` / `app.main-window.backgrounded` 事件风格一致

### 方案 B: Identify Traits (Rejected)

用 `analytics.identify()` 将版本信息作为 user traits。语义上更贴合"属性"，但当前代码无 identify 先例，且需要额外定义 traits schema，增加了不必要的复杂度。

## Key Decisions

1. **使用 track event 而非 identify** — 版本上报本质是启动事件，track 最简单直接
2. **仅在 Main 进程上报** — 版本信息是 app 级别数据，Main 进程直接访问 Electron API
3. **仅上报基础三要素** — version + platform + arch，不包含插件版本或运行时版本
4. **仅启动时上报** — 每次 app 启动 track 一次，不做定期心跳

## Implementation Scope

- `src/shared/features/analytics/events.ts` — 添加 `app.version.reported` event schema
- `src/main/app.ts` — 启动时 track 事件
- 事件命名遵循 `<namespace>.<object>.<action>` 约定
