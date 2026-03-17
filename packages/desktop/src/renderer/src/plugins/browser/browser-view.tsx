import { useCallback, useEffect, useRef, useState } from "react";

import { useRendererApp } from "../../core/app";
import { useContentPanelViewContext } from "../../features/content-panel/components/view-context";
import { BlankPage } from "./blank-page";
import { NavBar } from "./nav-bar";

export default function BrowserView() {
  const { viewId, viewState } = useContentPanelViewContext();
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;

  const webviewRef = useRef<WebviewElement>(null);

  // Persisted URL from viewState
  const persistedUrl = (viewState.url as string) ?? "";

  const [currentUrl, setCurrentUrl] = useState(persistedUrl);
  const [inputUrl, setInputUrl] = useState(persistedUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Navigate to a new URL
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
  const openDevTools = useCallback(() => webviewRef.current?.openDevTools({ mode: "bottom" }), []);

  return (
    <div className="flex h-full flex-col">
      <NavBar
        url={inputUrl}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onNavigate={navigate}
        onGoBack={goBack}
        onGoForward={goForward}
        onReload={reload}
        onOpenDevTools={openDevTools}
      />
      <div className="relative flex-1">
        {currentUrl ? (
          <webview ref={webviewRef} src={currentUrl} className="absolute inset-0 h-full w-full" />
        ) : (
          <BlankPage />
        )}
      </div>
    </div>
  );
}
