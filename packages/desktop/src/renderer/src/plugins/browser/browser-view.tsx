import { consumeEventIterator } from "@orpc/client";
import { ContractRouterClient } from "@orpc/contract";
import debug from "debug";
import { useCallback, useEffect, useRef, useState } from "react";

import type { browserContract } from "../../../../shared/plugins/browser/contract";

import { useRendererApp, usePluginContext } from "../../core/app";
import { useContentPanelViewContext } from "../../features/content-panel/components/view-context";
import { BlankPage } from "./blank-page";
import { NavBar } from "./nav-bar";

const log = debug("neovate:browser:view");

type BrowserClient = ContractRouterClient<{ browser: typeof browserContract }>;

export default function BrowserView() {
  const { viewId, viewState, isActive } = useContentPanelViewContext();
  const { orpcClient } = usePluginContext();
  const client = orpcClient as BrowserClient;
  const app = useRendererApp();
  const contentPanel = app.workbench.contentPanel;

  const containerRef = useRef<HTMLDivElement>(null);
  const createdRef = useRef(false);

  const persistedUrl = (viewState.url as string) ?? "";

  const [currentUrl, setCurrentUrl] = useState(persistedUrl);
  const [inputUrl, setInputUrl] = useState(persistedUrl);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [isInspecting, setIsInspecting] = useState(false);

  // Get bounds from container element
  const getBounds = useCallback(() => {
    const el = containerRef.current;
    if (!el) return { x: 0, y: 0, width: 0, height: 0 };
    const rect = el.getBoundingClientRect();
    return {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  }, []);

  // Create WebContentsView on mount, destroy on unmount
  useEffect(() => {
    if (!currentUrl || createdRef.current) return;

    const bounds = getBounds();
    createdRef.current = true;
    log("creating view: %s url=%s", viewId, currentUrl);
    client.browser.create({ viewId, url: currentUrl, bounds }).catch((err) => {
      log("create failed: %O", err);
      createdRef.current = false;
    });

    return () => {
      if (createdRef.current) {
        log("destroying view: %s", viewId);
        client.browser.destroy({ viewId }).catch(() => {});
        createdRef.current = false;
      }
    };
  }, [viewId, currentUrl, client.browser, getBounds]);

  // Track bounds with ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !createdRef.current) return;

    let rafId: number | null = null;

    const sendBounds = () => {
      rafId = null;
      if (!createdRef.current) return;
      const bounds = getBounds();
      client.browser.setBounds({ viewId, bounds }).catch(() => {});
    };

    const scheduleSendBounds = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(sendBounds);
    };

    const observer = new ResizeObserver(scheduleSendBounds);
    observer.observe(el);
    window.addEventListener("resize", scheduleSendBounds);

    // Send initial bounds
    sendBounds();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleSendBounds);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [viewId, currentUrl, client.browser, getBounds]);

  // Handle visibility based on isActive
  useEffect(() => {
    if (!createdRef.current) return;
    client.browser.setVisible({ viewId, visible: isActive }).catch(() => {});
    // Re-send bounds when becoming visible
    if (isActive) {
      requestAnimationFrame(() => {
        if (createdRef.current) {
          const bounds = getBounds();
          client.browser.setBounds({ viewId, bounds }).catch(() => {});
        }
      });
    }
  }, [isActive, viewId, client.browser, getBounds]);

  // Subscribe to events from main process
  useEffect(() => {
    if (!currentUrl || !createdRef.current) return;

    const cancel = consumeEventIterator(client.browser.events({ viewId }), {
      onEvent: (event) => {
        switch (event.type) {
          case "navigation":
            setInputUrl(event.detail.url);
            setCanGoBack(event.detail.canGoBack);
            setCanGoForward(event.detail.canGoForward);
            contentPanel.updateViewState(viewId, { url: event.detail.url });
            break;
          case "loading":
            setIsLoading(event.detail.isLoading);
            if (event.detail.canGoBack !== undefined) setCanGoBack(event.detail.canGoBack);
            if (event.detail.canGoForward !== undefined) setCanGoForward(event.detail.canGoForward);
            break;
          case "inspector":
            setIsInspecting(event.detail.active);
            break;
          case "title":
            break;
        }
      },
      onError: (err) => {
        log("event stream error: %O", err);
      },
    });

    return () => {
      cancel();
    };
  }, [viewId, currentUrl, client.browser, contentPanel]);

  const navigate = useCallback(
    (url: string) => {
      if (!createdRef.current) {
        // First navigation — set currentUrl to trigger create
        setCurrentUrl(url);
        setInputUrl(url);
        contentPanel.updateViewState(viewId, { url });
        return;
      }
      setInputUrl(url);
      contentPanel.updateViewState(viewId, { url });
      client.browser.navigate({ viewId, url }).catch(() => {});
    },
    [viewId, client.browser, contentPanel],
  );

  const goBack = useCallback(
    () => client.browser.goBack({ viewId }).catch(() => {}),
    [viewId, client.browser],
  );
  const goForward = useCallback(
    () => client.browser.goForward({ viewId }).catch(() => {}),
    [viewId, client.browser],
  );
  const reload = useCallback(
    () => client.browser.reload({ viewId }).catch(() => {}),
    [viewId, client.browser],
  );
  const openDevTools = useCallback(
    () => client.browser.openDevTools({ viewId }).catch(() => {}),
    [viewId, client.browser],
  );
  const toggleInspector = useCallback(
    () =>
      client.browser
        .executeJS({
          viewId,
          code: "window.__REACT_GRAB__ && window.__REACT_GRAB__.toggle()",
        })
        .catch(() => {}),
    [viewId, client.browser],
  );

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
      <div className="flex-1 overflow-hidden" ref={containerRef}>
        {!currentUrl && <BlankPage />}
      </div>
    </div>
  );
}
