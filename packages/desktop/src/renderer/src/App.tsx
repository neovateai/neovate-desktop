import { AgentChat, SessionList } from "./features/agent";
import {
  AppLayoutActivityBar,
  AppLayoutChatPanel,
  AppLayoutContentPanel,
  AppLayoutPanelSeparator,
  AppLayoutPrimarySidebar,
  AppLayoutPrimaryTitleBar,
  AppLayoutRoot,
  AppLayoutSecondarySidebar,
  AppLayoutSecondaryTitleBar,
  AppLayoutTitleBar,
  AppLayoutTrafficLights,
} from "./components/app-layout";
import { ThemeToggle } from "./components/ui/theme-toggle";

export default function App() {
  return (
    <AppLayoutRoot>
      <AppLayoutTrafficLights />

      <AppLayoutPrimarySidebar>
        <div className="flex h-full flex-col p-3">
          <SessionList />
        </div>
        <div className="mt-auto ml-auto px-1.5 pb-1.5">
          <ThemeToggle />
        </div>
      </AppLayoutPrimarySidebar>

      <AppLayoutPanelSeparator id="primarySidebar:chatPanel" />

      <AppLayoutTitleBar>
        <AppLayoutPrimaryTitleBar />
        <AppLayoutSecondaryTitleBar />
      </AppLayoutTitleBar>

      <AppLayoutChatPanel>
        <AgentChat />
      </AppLayoutChatPanel>

      <AppLayoutPanelSeparator id="chatPanel:contentPanel" />

      <AppLayoutContentPanel>
        <div className="flex h-full flex-col p-3">
          <h2 className="text-xs font-semibold text-muted-foreground">Content</h2>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground">Terminal, editor, browser</p>
          </div>
        </div>
      </AppLayoutContentPanel>

      <AppLayoutPanelSeparator id="contentPanel:secondarySidebar" />

      <AppLayoutSecondarySidebar />
      <AppLayoutActivityBar />
    </AppLayoutRoot>
  );
}
