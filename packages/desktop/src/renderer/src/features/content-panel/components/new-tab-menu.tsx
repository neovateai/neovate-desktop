import { useMemo } from "react";
import { Plus } from "lucide-react";
import { useStore } from "zustand";
import { useRendererApp } from "../../../core";
import { useProjectStore } from "../../project/store";
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "../../../components/ui/menu";
import { Button } from "../../../components/ui/button";
import type { ContentPanelStoreState } from "../types";

export function NewTabMenu() {
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const views = app.pluginManager.contributions.contentPanelViews;
  const projectPath = useProjectStore((s) => s.activeProject?.path ?? "");

  const tabs = useStore(
    contentPanel.store,
    (s: ContentPanelStoreState) => s.projects[projectPath]?.tabs ?? [],
  );
  const openViewIds = useMemo(() => new Set(tabs.map((t) => t.viewId)), [tabs]);

  return (
    <Menu>
      <MenuTrigger
        openOnHover
        delay={0}
        render={<Button variant="ghost" size="icon-sm" />}
      >
        <Plus className="size-3.5" />
      </MenuTrigger>
      <MenuPopup side="bottom" align="start">
        {views.map((view) => {
          const disabled = view.singleton !== false && openViewIds.has(view.id);
          return (
            <MenuItem
              key={view.id}
              disabled={disabled}
              onClick={() => contentPanel.openView(view.id)}
            >
              {view.icon && <view.icon className="size-3.5" />}
              {view.name}
            </MenuItem>
          );
        })}
      </MenuPopup>
    </Menu>
  );
}
