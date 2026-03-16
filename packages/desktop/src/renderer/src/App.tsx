import { lazy, Suspense, useEffect } from "react";

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
import { AgentChat, SessionList } from "./features/agent";
import { useConfigStore } from "./features/config/store";
import { ContentPanelRenderer } from "./features/content-panel";
import { useSettingsStore } from "./features/settings";
import { SettingsPage } from "./features/settings/components/settings-page";
import { UpdaterToast } from "./features/updater/updater-toast";
import { useGlobalKeybindings } from "./hooks/use-global-keybindings";

const Playground = import.meta.env.DEV ? lazy(() => import("./dev/playground")) : null;

export default function App() {
  useGlobalKeybindings();
  const showSettings = useSettingsStore((state) => state.showSettings);
  const developerMode = useConfigStore((s) => s.developerMode);

  // TODO: refactor with 统一的埋点体系, replace raw CustomEvent dispatching
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("neovate:log-event", { detail: { key: "APP_READY" } }));
  }, []);

  useEffect(() => {
    if (import.meta.env.DEV && developerMode) {
      void import("react-grab");
    }
  }, [developerMode]);

  useEffect(() => {
    if (import.meta.env.DEV && developerMode) {
      void import("react-scan").then(({ scan }) => {
        scan({ enabled: false, showToolbar: true });
      });
    }
  }, [developerMode]);

  if (import.meta.env.DEV && Playground && import.meta.env.VITE_UI_PLAYGROUND === "1") {
    return (
      <Suspense>
        <Playground />
      </Suspense>
    );
  }

  return (
    <>
      <AppLayoutRoot>
        <AppLayoutTrafficLights />

        <AppLayoutPrimarySidebar>
          <div className="flex h-full flex-col">
            <SessionList />
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
        <UpdaterToast />
      </AppLayoutRoot>

      {showSettings && <SettingsPage />}
    </>
  );
}
