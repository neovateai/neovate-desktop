import type React from "react";

export interface PluginContributions {
  activityBarItems?: ActivityBarItem[];
  secondarySidebarPanels?: SidebarPanel[];
  contentPanels?: ContentPanel[];
  primaryTitlebarItems?: TitlebarItem[];
  secondaryTitlebarItems?: TitlebarItem[];
}

export interface ActivityBarItem {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  tooltip: string;
  order?: number;
  /** References a SidebarPanel.id */
  panelId: string;
}

export interface SidebarPanel {
  id: string;
  title: string;
  component: () => Promise<{ default: React.ComponentType }>;
}

export interface ContentPanel {
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

export const EMPTY_CONTRIBUTIONS: Required<PluginContributions> = {
  activityBarItems: [],
  secondarySidebarPanels: [],
  contentPanels: [],
  primaryTitlebarItems: [],
  secondaryTitlebarItems: [],
};

export function mergeContributions(
  items: PluginContributions[],
): Required<PluginContributions> {
  const sortByOrder = <T extends { order?: number }>(list: T[]) =>
    list.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));

  return {
    activityBarItems: sortByOrder(
      items.flatMap((r) => r.activityBarItems ?? []),
    ),
    secondarySidebarPanels: items.flatMap(
      (r) => r.secondarySidebarPanels ?? [],
    ),
    contentPanels: items.flatMap((r) => r.contentPanels ?? []),
    primaryTitlebarItems: sortByOrder(
      items.flatMap((r) => r.primaryTitlebarItems ?? []),
    ),
    secondaryTitlebarItems: sortByOrder(
      items.flatMap((r) => r.secondaryTitlebarItems ?? []),
    ),
  };
}
