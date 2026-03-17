import { Plus } from "lucide-react";
import { useMemo } from "react";
import { useStore } from "zustand";

import type { ContentPanelStoreState, Tab } from "../types";

import { resolveLocalizedString } from "../../../../../shared/i18n";
import { Button } from "../../../components/ui/button";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../../../components/ui/menu";
import { useRendererApp } from "../../../core";
import { useConfigStore } from "../../config/store";
import { useProjectStore } from "../../project/store";

const EMPTY_TABS: Tab[] = [];

export function NewTabMenu() {
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const views = app.pluginManager.contributions.contentPanelViews;
  const projectPath = useProjectStore((s) => s.activeProject?.path ?? "");

  const tabs = useStore(
    contentPanel.store,
    (s: ContentPanelStoreState) => s.projects[projectPath]?.tabs ?? EMPTY_TABS,
  );
  const openViewTypes = useMemo(() => new Set(tabs.map((t) => t.viewType)), [tabs]);
  const locale = useConfigStore((s) => s.locale);
  return (
    <Menu>
      <MenuTrigger openOnHover delay={0} render={<Button variant="ghost" size="icon-sm" />}>
        <Plus className="size-3.5" />
      </MenuTrigger>
      <MenuPopup side="bottom" align="start">
        {views.map((view) => {
          const disabled = view.singleton !== false && openViewTypes.has(view.viewType);
          return (
            <MenuItem
              key={view.viewType}
              disabled={disabled}
              onClick={() => contentPanel.openView(view.viewType)}
            >
              {view.icon && <view.icon className="size-3.5" />}
              {resolveLocalizedString(view.name, locale)}
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}
