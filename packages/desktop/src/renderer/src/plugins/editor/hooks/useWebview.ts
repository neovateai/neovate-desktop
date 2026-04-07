import debug from "debug";
import { useLayoutEffect, useRef } from "react";

const log = debug("neovate:editor:usewebview");

export function useWebview(serverUrl: string | null, cb: (webview: HTMLWebViewElement) => void) {
  const webviewRef = useRef<HTMLWebViewElement>(null);

  const init = () => {
    const webview = webviewRef.current;
    if (!serverUrl || !webview) return;

    const onDomReady = async () => {
      // webview.openDevTools(); // 仅调试必要时打开，打开后刷新时概率导致卡死
      cb?.(webview);
    };

    const cleanup = () => {
      try {
        log("webview destroy");
        // @ts-ignore
        if (webview.isDevToolsOpened()) {
          // @ts-ignore
          webview.closeDevTools();
        }
      } catch {}
    };

    webview.addEventListener("dom-ready", onDomReady, { once: true });

    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
      cleanup();
    };
  };

  /**
   * 使用原生 <webview> 标签时，如果在打开 devtools 的情况下刷新页面，会导致进程卡死。
   * 且webview 仅支持外挂窗口式 devtools，不支持内嵌式。此外该方案已经不被官方推荐。
   * https://www.electronjs.org/zh/docs/latest/api/webview-tag#event-context-menu
   * TODO: 为什么没有采用「WebContentsView」方案？
   * - 全局弹窗目前层级无法高于内嵌窗口层，因此需要考虑较多情况以避免异常的视图脱离，后续需要考虑迁移到标准方案。
   * - Browser 功能也需要考虑相同的问题。
   */
  const openDevtools = () => {
    try {
      const webview = webviewRef.current;
      if (!webview) return;
      // @ts-ignore
      webview.openDevTools();
    } catch {}
  };

  /**
   * 为什么要用 useLayoutEffect？
   * 当 webview 因为外部原因被销毁前，需要提前执行cleanup 函数，确保webview 资源被正确释放。
   * 如果等到 DOM mutation 之后（useEffect），则会导致webview 已经不存在，相关资源不能正常释放
   */
  useLayoutEffect(() => {
    if (!serverUrl) return;

    return init();
  }, [serverUrl]);

  return {
    webviewRef,
    openDevtools,
  };
}
