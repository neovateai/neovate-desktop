import type { ContractRouterClient } from "@orpc/contract";

import { useCallback, useEffect, useRef, useState } from "react";

import type { browserContract } from "../../../../shared/plugins/browser/contract";

import { usePluginContext, useRendererApp } from "../../core/app";
import { useContentPanelViewContext } from "../../features/content-panel/components/view-context";
import { BlankPage } from "./blank-page";
import { NavBar } from "./nav-bar";

type BrowserClient = ContractRouterClient<{ browser: typeof browserContract }>;

export default function BrowserView() {
  const { viewId, viewState } = useContentPanelViewContext();
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;
  const { orpcClient } = usePluginContext();
  const client = orpcClient as BrowserClient;

  const webviewRef = useRef<WebviewElement>(null);
  const devToolsRef = useRef<WebviewElement>(null);

  const persistedUrl = (viewState.url as string) ?? "";

  const [currentUrl, setCurrentUrl] = useState(persistedUrl);
  const [inputUrl, setInputUrl] = useState(persistedUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [devToolsOpen, setDevToolsOpen] = useState(false);

  const navigate = useCallback(
    (url: string) => {
      setCurrentUrl(url);
      setInputUrl(url);
      contentPanel.updateViewState(viewId, { url });
    },
    [viewId, contentPanel],
  );

  // Webview event handlers
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const onStartLoading = () => setIsLoading(true);
    const onStopLoading = () => {
      setIsLoading(false);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
    };
    const onNavigate = (e: Event & { url: string }) => {
      setInputUrl(e.url);
      setCanGoBack(webview.canGoBack());
      setCanGoForward(webview.canGoForward());
      contentPanel.updateViewState(viewId, { url: e.url });
    };
    const onNavigateInPage = (e: Event & { url: string }) => {
      setInputUrl(e.url);
      contentPanel.updateViewState(viewId, { url: e.url });
    };

    webview.addEventListener("did-start-loading", onStartLoading);
    webview.addEventListener("did-stop-loading", onStopLoading);
    webview.addEventListener("did-navigate", onNavigate as EventListener);
    webview.addEventListener("did-navigate-in-page", onNavigateInPage as EventListener);

    return () => {
      webview.removeEventListener("did-start-loading", onStartLoading);
      webview.removeEventListener("did-stop-loading", onStopLoading);
      webview.removeEventListener("did-navigate", onNavigate as EventListener);
      webview.removeEventListener("did-navigate-in-page", onNavigateInPage as EventListener);
    };
  }, [viewId, contentPanel]);

  const goBack = useCallback(() => webviewRef.current?.goBack(), []);
  const goForward = useCallback(() => webviewRef.current?.goForward(), []);
  const reload = useCallback(() => webviewRef.current?.reload(), []);

  const toggleDevTools = useCallback(async () => {
    const webview = webviewRef.current;
    const devToolsWebview = devToolsRef.current;
    if (!webview) return;

    if (devToolsOpen) {
      await client.browser.closeDevTools({ pageWebContentsId: webview.getWebContentsId() });
      setDevToolsOpen(false);
    } else {
      if (!devToolsWebview) return;
      setDevToolsOpen(true);
      // Wait a tick for the devtools webview to mount and get a webContentsId
      requestAnimationFrame(async () => {
        await client.browser.openDevTools({
          pageWebContentsId: webview.getWebContentsId(),
          devToolsWebContentsId: devToolsWebview.getWebContentsId(),
        });
      });
    }
  }, [devToolsOpen, client]);

  return (
    <div className="flex h-full flex-col">
      <NavBar
        url={inputUrl}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        devToolsOpen={devToolsOpen}
        onNavigate={navigate}
        onGoBack={goBack}
        onGoForward={goForward}
        onReload={reload}
        onToggleDevTools={toggleDevTools}
      />
      {currentUrl ? (
        <div className="flex flex-1 flex-col overflow-hidden">
          <div className={devToolsOpen ? "h-1/2" : "flex-1"}>
            <webview ref={webviewRef} src={currentUrl} style={{ width: "100%", height: "100%" }} />
          </div>
          {devToolsOpen && (
            <div className="h-1/2 border-t">
              <webview
                ref={devToolsRef}
                src="about:blank"
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1">
          <BlankPage />
        </div>
      )}
    </div>
  );
}
