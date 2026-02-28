import { AgentChat } from "./features/acp";
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
          <h2 className="text-xs font-semibold text-muted-foreground">Sessions</h2>
          <div className="flex flex-1 items-center justify-center">
            <p className="text-xs text-muted-foreground">No sessions yet</p>
          </div>
        </div>
        <div className="mt-auto ml-auto px-1.5 pb-1.5">
          <ThemeToggle />
        </div>
      </AppLayoutPrimarySidebar>

      <AppLayoutPanelSeparator panelId="primarySidebar" />

      {/* Right container: titlebar + panels + status bar */}
      <div className="mb-2 flex min-w-0 flex-1 flex-col">
        <AppLayoutTitleBar>
          <AppLayoutPrimaryTitleBar />
          <AppLayoutSecondaryTitleBar />
        </AppLayoutTitleBar>

        <div className="flex min-h-0 flex-1">
          <div className="flex min-h-0 flex-1">
            <AppLayoutChatPanel>
              <AgentChat />
            </AppLayoutChatPanel>

            <AppLayoutPanelSeparator panelId="contentPanel" />

            <AppLayoutContentPanel>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Content</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">Terminal, editor, browser</p>
                </div>
              </div>
            </AppLayoutContentPanel>

            <AppLayoutPanelSeparator panelId="secondarySidebar" />

            <AppLayoutSecondarySidebar>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Files</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">File tree</p>
                </div>
              </div>
            </AppLayoutSecondarySidebar>
          </div>

          <AppLayoutActivityBar />
        </div>

        {/* <AppLayoutStatusBar /> */}
      </div>
    </AppLayoutRoot>
  );
}
