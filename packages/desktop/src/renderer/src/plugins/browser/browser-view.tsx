import { ContractRouterClient } from "@orpc/contract";
import debug from "debug";
import { useCallback, useEffect, useRef, useState } from "react";

import { browserContract } from "../../../../shared/plugins/browser/contract";
import { usePluginContext, useRendererApp } from "../../core/app";
import { useContentPanelViewContext } from "../../features/content-panel/components/view-context";
import { BlankPage } from "./blank-page";
import { INJECT_SCRIPT } from "./inject-react-grab";
import { NavBar } from "./nav-bar";

type BrowserClient = ContractRouterClient<{ browser: typeof browserContract }>;

const log = debug("neovate:browser-view");

export default function BrowserView() {
  const { viewId, viewState } = useContentPanelViewContext();
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;

  const webviewRef = useRef<WebviewElement>(null);
  const devtoolsWebviewRef = useRef<WebviewElement>(null);
  const devToolsWasOpen = useRef(false);

  const persistedUrl = (viewState.url as string) ?? "";

  const [currentUrl, setCurrentUrl] = useState(persistedUrl);
  const [inputUrl, setInputUrl] = useState(persistedUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);
  const [showDevTools, setShowDevTools] = useState(false);
  const [splitRatio, setSplitRatio] = useState(0.5);
  const [enableInspect, setEnableInspect] = useState(false);

  const { orpcClient } = usePluginContext();
  const client = orpcClient as BrowserClient;

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
        const event = JSON.parse(e.message.slice(GRAB_PREFIX.length));
        if (!event?.type) {
          return;
        }
        if (event.type == "activate") {
          setIsInspecting(true);
        } else if (event.type == "deactivate") {
          setIsInspecting(false);
        } else if (event.type === "copy") {
          // TODO: 当前只简单处理，作为体验功能，后续完善
          if (event.content) {
            const mentionContent = event.content.slice(0, 200);
            log("insert-chat dispatching mention=%s", mentionContent);
            window.dispatchEvent(
              new CustomEvent("neovate:insert-chat", {
                detail: {
                  mentions: [{ id: mentionContent, label: mentionContent }],
                },
              }),
            );
          }
        } else if (event.type === "inspectable") {
          setEnableInspect(true);
        }
        // 此外还有select事件，暂不消费
      } catch {
        // ignore parse errors
      }
    };

    webview.addEventListener("dom-ready", onDomReady);
    webview.addEventListener("did-start-loading", onStartLoading);
    webview.addEventListener("did-stop-loading", onStopLoading);
    webview.addEventListener("did-navigate", onNavigate as EventListener);
    // # 锚点更新类的导航
    webview.addEventListener("did-navigate-in-page", onNavigateInPage as EventListener);
    webview.addEventListener("console-message", onConsoleMessage as EventListener);

    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
      webview.removeEventListener("did-start-loading", onStartLoading);
      webview.removeEventListener("did-stop-loading", onStopLoading);
      webview.removeEventListener("did-navigate", onNavigate as EventListener);
      webview.removeEventListener("did-navigate-in-page", onNavigateInPage as EventListener);
      webview.removeEventListener("console-message", onConsoleMessage as EventListener);
      setEnableInspect(false);
    };
  }, [currentUrl, viewId, contentPanel]);

  // Cleanup: detach devtools when component unmounts or devtools closed
  useEffect(() => {
    return () => {
      if (!devToolsWasOpen.current) return;
      const webview = webviewRef.current;
      if (!webview) return;
      try {
        const sourceId = webview.getWebContentsId();
        client.browser.detachDevTools({ sourceId });
      } catch {
        // ignore
      }
    };
  }, []);

  const goBack = useCallback(() => webviewRef.current?.goBack(), []);
  const goForward = useCallback(() => webviewRef.current?.goForward(), []);
  const reload = useCallback(() => webviewRef.current?.reload(), []);
  const toggleInspector = useCallback(() => {
    webviewRef.current?.executeJavaScript(
      "window.__REACT_GRAB__ && window.__REACT_GRAB__.toggle()",
      true,
    );
  }, []);

  const toggleDevTools = useCallback(async () => {
    const webview = webviewRef.current;
    if (!webview) {
      return;
    }
    try {
      const sourceId = webview.getWebContentsId();
      if (showDevTools) {
        await client.browser.detachDevTools({ sourceId });
        setShowDevTools(false);
        devToolsWasOpen.current = false;
      } else {
        const devtoolsWebview = devtoolsWebviewRef.current;
        if (!devtoolsWebview) return;
        const targetId = devtoolsWebview.getWebContentsId();
        await client.browser.attachDevTools({ sourceId, targetId });
        devToolsWasOpen.current = true;
        setShowDevTools(true);
      }
    } catch (e) {
      log("toggle devtools error", e);
    }
  }, [showDevTools]);

  // Resize handling
  const handleResizeStart = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      const container = (e.target as HTMLElement).parentElement;
      if (!container) return;

      const startY = e.clientY;
      const startRatio = splitRatio;
      const containerHeight = container.getBoundingClientRect().height;

      // Block webview from swallowing pointer events during drag
      const webviews = container.querySelectorAll("webview");
      for (const wv of webviews) (wv as HTMLElement).style.pointerEvents = "none";

      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const onPointerMove = (ev: PointerEvent) => {
        const delta = ev.clientY - startY;
        const newRatio = Math.min(0.8, Math.max(0.2, startRatio + delta / containerHeight));
        setSplitRatio(newRatio);
      };

      const cleanup = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        for (const wv of webviews) (wv as HTMLElement).style.pointerEvents = "";
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", cleanup);
        document.removeEventListener("pointercancel", cleanup);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", cleanup);
      document.addEventListener("pointercancel", cleanup);
    },
    [splitRatio],
  );

  return (
    <div className="flex h-full flex-col">
      <NavBar
        url={inputUrl}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        isInspecting={isInspecting}
        isDevToolsOpen={showDevTools}
        onNavigate={navigate}
        onGoBack={goBack}
        onGoForward={goForward}
        onReload={reload}
        onToggleDevTools={toggleDevTools}
        onToggleInspector={toggleInspector}
        enableInspect={enableInspect}
      />
      <div className="relative flex-1 overflow-hidden">
        {currentUrl ? (
          <>
            <webview
              ref={webviewRef}
              src={currentUrl}
              style={{
                width: "100%",
                height: showDevTools ? `${splitRatio * 100}%` : "100%",
              }}
              // @ts-ignore 常规来说 allowpopups=true时用于支持新窗口行为， 而作为true不赋值即可，但现状是不赋值该属性就不存在（可能和编译行为有关），需要显式用字符串声明，因此此处用ts-ignore 规避误报
              // 此外，该值仅在初始化中生效，后续热更新修改不会影响实际webview配置，推测该值可能在主进程 did-attach-webview 触发时已经确定且不可修改
              allowpopups="true"
            />
            {/* Resize handle */}
            <div
              className="h-1 cursor-row-resize bg-border hover:bg-primary/50 active:bg-primary"
              style={{ display: showDevTools ? undefined : "none" }}
              onPointerDown={handleResizeStart}
            />
            {/* DevTools webview — always mounted, hidden via display:none until opened */}
            <webview
              ref={devtoolsWebviewRef}
              src="about:blank"
              style={{
                width: "100%",
                height: `${(1 - splitRatio) * 100}%`,
                display: showDevTools ? undefined : "none",
              }}
            />
          </>
        ) : (
          <BlankPage />
        )}
      </div>
    </div>
  );
}
