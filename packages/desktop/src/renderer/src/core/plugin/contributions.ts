import type React from "react";

// ─── Contribution Types ─────────────────────────────────────────────

export interface PluginContributions {
  activityBarItems?: ActivityBarItem[];
  secondarySidebarViews?: SecondarySidebarView[];
  contentPanelViews?: ContentPanelView[];
  primaryTitlebarItems?: TitlebarItem[];
  secondaryTitlebarItems?: TitlebarItem[];
}
export interface ActivityBarItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  order?: number;
  action: { type: "secondarySidebarView"; viewId: string };
}

export interface SecondarySidebarView {
  id: string;
  title: string;
  component: () => Promise<{ default: React.ComponentType }>;
}

export interface ContentPanelView {
  id: string;
  name: string;
  icon?: React.ComponentType<{ className?: string }>;
  singleton?: boolean;
  component: () => Promise<{
    default: React.ComponentType<{ tab: PluginTab }>;
  }>;
}

/** Minimal tab info passed to content panel components */
export interface PluginTab {
  id: string;
  panelId: string;
  name: string;
  props?: Record<string, unknown>;
}

export interface TitlebarItem {
  id: string;
  order?: number;
  component: () => Promise<{ default: React.ComponentType }>;
}

// ─── Merge ──────────────────────────────────────────────────────────

/** Merge partial contributions from multiple plugins into a complete set */
export function buildContributions(
  items: (PluginContributions | null | undefined)[],
): Required<PluginContributions> {
  const valid = items.filter((r): r is PluginContributions => r != null);

  const sortByOrder = <T extends { order?: number }>(list: T[]) =>
    list.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return {
    activityBarItems: sortByOrder(valid.flatMap((r) => r.activityBarItems ?? [])),
    secondarySidebarViews: valid.flatMap((r) => r.secondarySidebarViews ?? []),
    contentPanelViews: valid.flatMap((r) => r.contentPanelViews ?? []),
    primaryTitlebarItems: sortByOrder(valid.flatMap((r) => r.primaryTitlebarItems ?? [])),
    secondaryTitlebarItems: sortByOrder(valid.flatMap((r) => r.secondaryTitlebarItems ?? [])),
  };
}
