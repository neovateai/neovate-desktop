import { AgentChat } from "./features/acp"
import {
  ActivityBar,
  AppLayoutActivityBar,
  AppLayoutChatPanel,
  AppLayoutContentPanel,
  AppLayoutPrimarySidebar,
  AppLayoutPrimaryTitleBar,
  AppLayoutRoot,
  AppLayoutSecondarySidebar,
  AppLayoutSecondaryTitleBar,
  AppLayoutStatusBar,
  AppLayoutTitleBar,
  AppLayoutTrafficLights,
} from "./components/layout"

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
      </AppLayoutPrimarySidebar>

      {/* Right container: titlebar + panels + status bar */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppLayoutTitleBar>
          <AppLayoutPrimaryTitleBar />
          <AppLayoutSecondaryTitleBar />
        </AppLayoutTitleBar>

        <div className="flex min-h-0 flex-1">
          {/* Panel row */}
          <div className="flex min-h-0 flex-1 gap-1">
            <AppLayoutChatPanel>
              <AgentChat />
            </AppLayoutChatPanel>

            <AppLayoutContentPanel>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Content</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">Terminal, editor, browser</p>
                </div>
              </div>
            </AppLayoutContentPanel>

            <AppLayoutSecondarySidebar>
              <div className="flex h-full flex-col p-3">
                <h2 className="text-xs font-semibold text-muted-foreground">Files</h2>
                <div className="flex flex-1 items-center justify-center">
                  <p className="text-xs text-muted-foreground">File tree</p>
                </div>
              </div>
            </AppLayoutSecondarySidebar>
          </div>

          <AppLayoutActivityBar>
            <ActivityBar />
          </AppLayoutActivityBar>
        </div>

        <AppLayoutStatusBar />
      </div>
    </AppLayoutRoot>
  )
}
