import type React from "react";

import debug from "debug";

import type { ProviderTemplate } from "../../../../shared/features/provider/built-in";
import type { LocalizedString } from "../../../../shared/i18n";
import type { ExternalUriOpenerContribution } from "../external-uri-opener";
import type { Contribution } from "./contribution";

const log = debug("neovate:plugin");

// ─── Contribution Types ─────────────────────────────────────────────

/** View/UI contributions — things that register visual slots */
export interface PluginViewContributions {
  activityBarItems?: ActivityBarItem[];
  secondarySidebarViews?: SecondarySidebarView[];
  contentPanelViews?: ContentPanelView[];
  primaryTitlebarItems?: TitlebarItem[];
  secondaryTitlebarItems?: TitlebarItem[];
}

/** Data/config contributions — non-visual registrations */
export interface PluginContributions {
  providerTemplates?: ProviderTemplate[];
  externalUriOpeners?: ExternalUriOpenerContribution[];
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
  deactivation?: "hidden" | "offscreen" | "activity" | "unmount"; // default "activity"
  component: () => Promise<{ default: React.ComponentType }>;
}

export interface ContentPanelView {
  viewType: string;
  name: string | LocalizedString;
  icon?: React.ComponentType<{ className?: string }>;
  singleton?: boolean; // default true; per-project scope
  persist?: boolean; // default true; whether the tab is persisted to storage
  deactivation?: "hidden" | "offscreen" | "activity" | "unmount"; // default "hidden"
  component: () => Promise<{ default: React.ComponentType }>; // no props — uses hooks
}

export interface TitlebarItem {
  id: string;
  tooltip?: string | LocalizedString;
  order?: number;
  component: () => Promise<{ default: React.ComponentType }>;
}

export interface WindowContribution {
  /** Unique window type identifier — matches windowType URL param */
  windowType: string;
  /** Root component rendered for this window type */
  component: () => Promise<{ default: React.ComponentType }>;
}

// ─── Utilities ──────────────────────────────────────────────────────

export const sortByOrder = <T extends { order?: number }>(list: Contribution<T>[]) =>
  list.toSorted((a, b) => (a.value.order ?? Infinity) - (b.value.order ?? Infinity));

export function deduplicateById<T extends { id: string }>(
  items: Contribution<T>[],
): Contribution<T>[] {
  const seen = new Set<string>();
  return items.filter((c) => {
    if (seen.has(c.value.id)) {
      log("duplicate id=%s from plugin=%s, skipping", c.value.id, c.plugin.name);
      return false;
    }
    seen.add(c.value.id);
    return true;
  });
}
