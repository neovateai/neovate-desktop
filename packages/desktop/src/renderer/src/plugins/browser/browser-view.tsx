import { useCallback, useEffect, useRef, useState } from "react";

import { useRendererApp } from "../../core/app";
import { useContentPanelViewContext } from "../../features/content-panel/components/view-context";
import { BlankPage } from "./blank-page";
import { INJECT_SCRIPT } from "./inject-react-grab";
import { NavBar } from "./nav-bar";

export default function BrowserView() {
  const { viewId, viewState } = useContentPanelViewContext();
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;

  const webviewRef = useRef<WebviewElement>(null);

  const persistedUrl = (viewState.url as string) ?? "";

  const [currentUrl, setCurrentUrl] = useState(persistedUrl);
  const [inputUrl, setInputUrl] = useState(persistedUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);

  const navigate = useCallback(
    (url: string) => {
      setCurrentUrl(url);
      setInputUrl(url);
      contentPanel.updateViewState(viewId, { url });
    },
    [viewId, contentPanel],
  );

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const onDomReady = () => {
      webview.executeJavaScript(INJECT_SCRIPT, true);
    };
    const onStartLoading = () => {
      setIsLoading(true);
    };
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
    const GRAB_PREFIX = "BROWSER_PLUGIN:";
    const onConsoleMessage = (e: Event & { message: string }) => {
      if (!e.message.startsWith(GRAB_PREFIX)) return;
      try {
        const { active } = JSON.parse(e.message.slice(GRAB_PREFIX.length));
        if (active !== undefined) setIsInspecting(active);
      } catch {
        // ignore parse errors
      }
    };

    webview.addEventListener("dom-ready", onDomReady);
    webview.addEventListener("did-start-loading", onStartLoading);
    webview.addEventListener("did-stop-loading", onStopLoading);
    webview.addEventListener("did-navigate", onNavigate as EventListener);
    webview.addEventListener("did-navigate-in-page", onNavigateInPage as EventListener);
    webview.addEventListener("console-message", onConsoleMessage as EventListener);

    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
      webview.removeEventListener("did-start-loading", onStartLoading);
      webview.removeEventListener("did-stop-loading", onStopLoading);
      webview.removeEventListener("did-navigate", onNavigate as EventListener);
      webview.removeEventListener("did-navigate-in-page", onNavigateInPage as EventListener);
      webview.removeEventListener("console-message", onConsoleMessage as EventListener);
    };
  }, [viewId, contentPanel]);

  const goBack = useCallback(() => webviewRef.current?.goBack(), []);
  const goForward = useCallback(() => webviewRef.current?.goForward(), []);
  const reload = useCallback(() => webviewRef.current?.reload(), []);
  const openDevTools = useCallback(() => webviewRef.current?.openDevTools(), []);
  const toggleInspector = useCallback(() => {
    webviewRef.current?.executeJavaScript(
      "window.__REACT_GRAB__ && window.__REACT_GRAB__.toggle()",
      true,
    );
  }, []);

  return (
    <div className="flex h-full flex-col">
      <NavBar
        url={inputUrl}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isInspecting={isInspecting}
        onNavigate={navigate}
        onGoBack={goBack}
        onGoForward={goForward}
        onReload={reload}
        onOpenDevTools={openDevTools}
        onToggleInspector={toggleInspector}
      />
      <div className="flex-1 overflow-hidden">
        {currentUrl ? (
          <webview ref={webviewRef} src={currentUrl} style={{ width: "100%", height: "100%" }} />
        ) : (
          <BlankPage />
        )}
      </div>
    </div>
  );
}
