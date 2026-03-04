import { ScrollArea } from "../../../components/ui/scroll-area";
import type { Tab } from "../types";
import { TabItem } from "./tab-item";
import { NewTabMenu } from "./new-tab-menu";

export function TabBar({
  tabs,
  activeTabId,
  registeredViewIds,
}: {
  tabs: Tab[];
  activeTabId: string | null;
  registeredViewIds: Set<string>;
}) {
  return (
    <div className="flex items-center border-b border-border px-1.5 py-1">
      <ScrollArea scrollFade className="min-w-0 flex-1 [&_[data-slot=scroll-area-scrollbar]]:hidden [&_[data-slot=scroll-area-viewport]]:!flex [&_[data-slot=scroll-area-viewport]]:items-center">
        <div className="flex items-center gap-0.5">
          {tabs.map((tab) => (
            <TabItem
              key={tab.id}
              tab={tab}
              isActive={activeTabId === tab.id}
              isOrphan={!registeredViewIds.has(tab.viewId)}
            />
          ))}
        </div>
      </ScrollArea>
      <NewTabMenu />
    </div>
  );
}
