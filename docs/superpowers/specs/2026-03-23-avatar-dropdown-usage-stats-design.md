# Avatar Dropdown with Usage Statistics

## Overview

Replace the settings icon in the top-right corner with a user avatar that shows a dropdown menu on hover. The dropdown contains two options: "Usage Statistics" and "Settings".

## Components

### 1. UserAvatarMenu

**Location**: `src/renderer/src/components/user-avatar-menu.tsx`

A dropdown menu component that:

- Displays a circular avatar (default icon or user initials)
- Shows dropdown on hover with two menu items
- Uses the existing Menu component from `components/ui/menu`

```tsx
<Menu>
  <MenuTrigger>
    <Avatar /> // Circle with User icon
  </MenuTrigger>
  <MenuPopup>
    <MenuItem onClick={() => setShowUsage(true)}>
      <BarChart3 /> Usage Statistics
    </MenuItem>
    <MenuItem onClick={() => setShowSettings(true)}>
      <Settings /> Settings
    </MenuItem>
  </MenuPopup>
</Menu>
```

### 2. UsagePage

**Location**: `src/renderer/src/features/usage/`

A full-screen overlay page (same pattern as SettingsPage) containing:

#### 2.1 UsageMenu (Left Sidebar)

- Back to App button
- Navigation: Overview, Analytics

#### 2.2 Content Panels

**OverviewPanel**:

- TimeRangeTabs (Today / Week / Month)
- StatCards grid (4 cards):
  - Total Cost (USD)
  - Tokens (with cache percentage)
  - Lines Changed (+/-)
  - Sessions (with today count)
- CostChart (stacked area chart by model)
- ActivityHeatmap (365-day grid)

**AnalyticsPanel** (future):

- Cache hit trend
- Peak hours chart
- Session length distribution
- Error rate

### 3. State Management

Extend `useSettingsStore` in `src/renderer/src/features/settings/store.ts`:

```typescript
export type SettingsMenuId = "general" | "chat" | ... | "usage";

interface SettingsUIState {
  showSettings: boolean;
  showUsage: boolean;  // NEW
  activeTab: SettingsMenuId;
  // ...
}
```

Or create separate `useUsageStore` for cleaner separation.

## Data Layer

### Types

```typescript
// src/shared/features/usage/types.ts

type TimeRange = "today" | "week" | "month";

interface SummaryStats {
  totalCost: number;
  totalTokens: number;
  cacheTokens: number;
  cachePercentage: number;
  totalSessions: number;
  todaySessions: number;
  linesOfCodeAdded: number;
  linesOfCodeRemoved: number;
  costChangePercent: number;
}

interface ModelCostData {
  date: string;
  model: string;
  cost: number;
}

interface ActivityDay {
  date: string;
  count: number;
}
```

### oRPC Contract

```typescript
// src/shared/features/usage/contract.ts

export const usageContract = {
  getSummaryStats: oc.input(z.object({ timeRange: z.enum(["today", "week", "month"]) }))
    .output(SummaryStatsSchema),
  getCostTrend: oc.input(z.object({ timeRange: ... })).output(z.array(ModelCostDataSchema)),
  getActivityHeatmap: oc.output(z.array(ActivityDaySchema)),
}
```

### Backend (Phase 1: Mock Data)

Initially return mock/placeholder data. Future integration can connect to:

- Session tracking from agent store
- Token counting from API responses
- Cost calculation based on model pricing

## UI Components to Create

1. **StatCard** - Metric card with icon, value, unit, description
2. **TimeRangeTabs** - Toggle between Today/Week/Month
3. **CostChart** - ECharts stacked area chart
4. **ActivityHeatmap** - 365-day contribution grid

## File Structure

```
src/renderer/src/
├── components/
│   └── user-avatar-menu.tsx          # NEW: Avatar dropdown
├── features/
│   └── usage/
│       ├── index.ts
│       ├── store.ts                   # Usage UI state
│       ├── components/
│       │   ├── usage-page.tsx         # Main page (like settings-page)
│       │   ├── usage-menu.tsx         # Left sidebar nav
│       │   ├── panels/
│       │   │   ├── overview-panel.tsx
│       │   │   └── analytics-panel.tsx
│       │   ├── stat-card.tsx
│       │   ├── time-range-tabs.tsx
│       │   ├── cost-chart.tsx
│       │   └── activity-heatmap.tsx
│       └── hooks/
│           └── use-summary-stats.ts

src/shared/features/usage/
├── contract.ts
└── types.ts

src/main/features/usage/
└── router.ts
```

## Implementation Phases

### Phase 1: UI Shell

1. Create UserAvatarMenu component
2. Replace settings button in AppLayoutSecondaryTitleBar
3. Create UsagePage with placeholder content
4. Wire up navigation

### Phase 2: Statistics UI

1. Create StatCard, TimeRangeTabs components
2. Implement OverviewPanel with mock data
3. Add CostChart using ECharts
4. Add ActivityHeatmap

### Phase 3: Backend Integration

1. Define oRPC contracts
2. Implement mock data handlers
3. Connect frontend to backend

### Phase 4: Real Data (Future)

1. Track session/token data in main process
2. Persist to local storage
3. Calculate real statistics

## Dependencies

- `echarts` - For charts (already may need to add)
- Existing UI components: Menu, Button, Avatar patterns

## i18n Keys

```json
{
  "usage.title": "Usage Statistics",
  "usage.overview": "Overview",
  "usage.analytics": "Analytics",
  "usage.backToApp": "Back to App",
  "usage.totalCost": "Total Cost",
  "usage.tokens": "Tokens",
  "usage.linesChanged": "Lines Changed",
  "usage.sessions": "Sessions",
  "usage.today": "Today",
  "usage.week": "Week",
  "usage.month": "Month"
}
```
