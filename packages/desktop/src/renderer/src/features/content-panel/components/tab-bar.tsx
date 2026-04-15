import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { restrictToHorizontalAxis } from "@dnd-kit/modifiers";
import { SortableContext, arrayMove, horizontalListSortingStrategy } from "@dnd-kit/sortable";
import { useCallback, useMemo, useState } from "react";

import type { Tab } from "../types";

import { resolveLocalizedString } from "../../../../../shared/i18n";
import { ScrollArea } from "../../../components/ui/scroll-area";
import { useRendererApp } from "../../../core";
import { useConfigStore } from "../../config/store";
import { NewTabMenu } from "./new-tab-menu";
import { TabItem } from "./tab-item";

export function TabBar({
  tabs,
  activeTabId,
  registeredViewTypes,
}: {
  tabs: Tab[];
  activeTabId: string | null;
  registeredViewTypes: Set<string>;
}) {
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const locale = useConfigStore((s) => s.locale);
  const views = app.pluginManager.viewContributions.contentPanelViews.map((c) => c.value);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const tabIds = useMemo(() => tabs.map((t) => t.id), [tabs]);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveId(null);
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const oldIndex = tabIds.indexOf(active.id as string);
      const newIndex = tabIds.indexOf(over.id as string);
      if (oldIndex === -1 || newIndex === -1) return;
      contentPanel.reorderTabs(arrayMove(tabIds, oldIndex, newIndex));
    },
    [tabIds, contentPanel],
  );

  const handleDragCancel = useCallback(() => {
    setActiveId(null);
  }, []);

  const activeTab = useMemo(() => tabs.find((t) => t.id === activeId) ?? null, [tabs, activeId]);
  const activeView = useMemo(
    () => (activeTab ? views.find((v) => v.viewType === activeTab.viewType) : null),
    [activeTab, views],
  );

  return (
    <div className="flex items-center border-b border-border h-10">
      <ScrollArea
        scrollFade
        className="min-w-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:!flex [&_[data-slot=scroll-area-viewport]]:items-center"
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToHorizontalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext items={tabIds} strategy={horizontalListSortingStrategy}>
            <div className="flex items-center gap-0.5">
              {tabs.map((tab) => (
                <TabItem
                  key={tab.id}
                  tab={tab}
                  isActive={activeTabId === tab.id}
                  isOrphan={!registeredViewTypes.has(tab.viewType)}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeTab ? (
              <div className="flex items-center gap-1 rounded-md bg-popover px-2 py-1 text-sm font-medium shadow-lg border border-border/50">
                {activeView?.icon && <activeView.icon className="size-3.5" />}
                <span className="truncate">
                  {activeView
                    ? resolveLocalizedString(activeView.name, locale)
                    : activeTab.viewType}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </ScrollArea>
      <NewTabMenu />
    </div>
  );
}
