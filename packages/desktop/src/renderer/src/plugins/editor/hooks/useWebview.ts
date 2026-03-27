import { useEffect, useRef } from "react";

export function useWebview(serverUrl: string | null, cb: (webview: HTMLWebViewElement) => void) {
  const webviewRef = useRef<HTMLWebViewElement>(null);

  const init = () => {
    const webview = webviewRef.current;
    if (!webview) return;

    const onDomReady = async () => {
      // webview.openDevTools(); // 仅调试必要时打开，打开后刷新时概率导致卡死
      cb?.(webview);
    };

    webview.addEventListener("dom-ready", onDomReady, { once: true });

    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
    };
  };

  // 测试注入
  useEffect(() => {
    if (!serverUrl) return;

    return init();
  }, [serverUrl]);

  return {
    webviewRef,
  };
}
