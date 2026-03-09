import type { Tab } from "../types";

import { ScrollArea } from "../../../components/ui/scroll-area";
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
  return (
    <div className="flex items-center border-b border-border px-1.5 py-1">
      <ScrollArea
        scrollFade
        className="min-w-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:!flex [&_[data-slot=scroll-area-viewport]]:items-center"
      >
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
      </ScrollArea>
      <NewTabMenu />
    </div>
  );
}
