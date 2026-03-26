import type React from "react";

import debug from "debug";

import type { ProviderTemplate } from "../../../../shared/features/provider/built-in";
import type { LocalizedString } from "../../../../shared/i18n";
import type { ExternalUriOpenerContribution } from "../external-uri-opener";

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

// ─── Merge ──────────────────────────────────────────────────────────

/** Deduplicate provider templates by id (first-wins) */
function deduplicateTemplates(templates: ProviderTemplate[]): ProviderTemplate[] {
  const seen = new Set<string>();
  return templates.filter((t) => {
    if (seen.has(t.id)) {
      log("duplicate providerTemplate id=%s, skipping", t.id);
      return false;
    }
    seen.add(t.id);
    return true;
  });
}

/** Merge partial view contributions from multiple plugins into a complete set */
export function buildViewContributions(
  items: (PluginViewContributions | null | undefined)[],
): Required<PluginViewContributions> {
  const valid = items.filter((r): r is PluginViewContributions => r != null);

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

/** Merge partial data contributions from multiple plugins into a complete set */
export function buildContributions(
  items: (PluginContributions | null | undefined)[],
): Required<PluginContributions> {
  const valid = items.filter((r): r is PluginContributions => r != null);

  return {
    providerTemplates: deduplicateTemplates(valid.flatMap((r) => r.providerTemplates ?? [])),
    externalUriOpeners: valid.flatMap((r) => r.externalUriOpeners ?? []),
  };
}
