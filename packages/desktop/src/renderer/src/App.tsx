import { AgentChat, SessionList } from "./features/agent";
import { ContentPanelRenderer } from "./features/content-panel";
import { useSettingsStore } from "./features/settings";
import { SettingsPage } from "./features/settings/components/settings-page";
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
import { useGlobalKeybindings } from "./hooks/use-global-keybindings";

export default function App() {
  useGlobalKeybindings();
  const showSettings = useSettingsStore((state) => state.showSettings);

  // Show Settings page when settings mode is active
  if (showSettings) {
    return <SettingsPage />;
  }

  return (
    <AppLayoutRoot>
      <AppLayoutTrafficLights />

      <AppLayoutPrimarySidebar>
        <div className="flex h-full flex-col p-3">
          <SessionList />
        </div>
        <div className="mt-auto flex items-center justify-end px-1.5 pb-1.5">
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
        <ContentPanelRenderer />
      </AppLayoutContentPanel>

      <AppLayoutPanelSeparator id="contentPanel:secondarySidebar" />

      <AppLayoutSecondarySidebar />
      <AppLayoutActivityBar />
    </AppLayoutRoot>
  );
}
