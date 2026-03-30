import { consumeEventIterator } from "@orpc/client";
import { ContractRouterClient } from "@orpc/contract";
import debug from "debug";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

import {
  editorContract,
  EditorOpenOption,
  IEditorTab,
} from "../../../../shared/plugins/editor/contract";
import { toastManager } from "../../components/ui/toast";
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { useWebview } from "./hooks/useWebview";
import { useEditorTranslation } from "./i18n";
import { ErrorState, LoadingState } from "./status";
import { EditorStatus } from "./type";
import { handleEditorEvents } from "./utils/events";
import { executeInject } from "./utils/injector";

const log = debug("neovate:editor:view");

type EditorClient = ContractRouterClient<{ editor: typeof editorContract }>;

function EditorViewCore(props: { cwd: string }) {
  const { cwd = "" } = props;
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<EditorStatus>("idle");
  const [tabs, setTabs] = useState<IEditorTab[]>([]);
  const initRef = useRef(false);
  const [extReady, seExtReady] = useState(false); // vscode 扩展就绪情况
  const { resolvedTheme } = useTheme();
  const { t } = useEditorTranslation();

  const { orpcClient } = usePluginContext();
  const client = orpcClient as EditorClient;

  const { webviewRef } = useWebview(serverUrl, (instance) => {
    executeInject(instance);
  });

  useEffect(() => {
    if (!cwd) {
      return;
    }
    if (initRef.current && status === "ready") return;
    initRef.current = true;

    startEditor();
    client.editor.connect().then(() => {
      log("extension bridge connected");
      seExtReady(true);
    });
  }, [cwd]);

  useEffect(() => {
    if (extReady) {
      const disposable = initExtensionHandlers();
      return () => {
        disposable.forEach((fn) => fn());
      };
    } else {
      return () => {};
    }
  }, [extReady]);

  useEffect(() => {
    if (extReady) {
      client.editor.setTheme({ cwd, theme: resolvedTheme || "dark" });
    }
  }, [resolvedTheme, extReady]);

  const initExtensionHandlers = () => {
    const disposable: Array<() => void> = [];
    disposable.push(initFileOpener());
    disposable.push(initEditorEventHandlers());
    return disposable;
  };
  /** subscribe and receive editor events from extension */
  const initEditorEventHandlers = () => {
    const cancel = consumeEventIterator(client.editor.events({ cwd }), {
      onEvent: (e) => {
        log("editor events received", e);
        handleEditorEvents(e, {
          onTabsChange: (newTabs) => {
            setTabs(newTabs);
          },
        });
      },
      onError: (e) => {
        log("editor events error", e);
      },
    });
    return () => {
      cancel();
    };
  };
  /** receive `open-editor` event from other views and call extension to execute */
  const initFileOpener = () => {
    {
      // @ts-ignore 避免初始化前未收到事件
      const pending = window.pendingEditorRequest as EditorOpenOption;
      if (pending?.fullPath) {
        openInEditor({
          fullPath: pending.fullPath,
          line: pending.line || 1,
          focus: pending?.focus,
        });
      }
      // 连接成功后初始化插件可接受的操作事件响应函数
      const openEditorEvent = (e: Event) => {
        const {
          fullPath = "",
          line = 1,
          focus = false,
        } = (e as CustomEvent<EditorOpenOption>)?.detail || {};
        openInEditor({ fullPath, line, focus });
      };
      window.addEventListener("neovate:open-editor", openEditorEvent);

      return () => {
        window.removeEventListener("neovate:open-editor", openEditorEvent);
      };
    }
  };

  const openInEditor = async (opts: EditorOpenOption) => {
    const { fullPath, line, focus } = opts || {};
    if (!fullPath) {
      return;
    }
    log("opening file", { fullPath, line });
    // @ts-ignore 清理
    window.pendingEditorRequest = undefined;
    const res = await client.editor.open({ cwd, fullPath, line, focus });
    if (res?.error) {
      toastManager.add({
        type: "warning",
        title: "Editor warning",
        description: res.error,
        timeout: 8000,
      });
    }
  };

  const startEditor = async () => {
    if (status === "starting") return;

    setStatus("starting");
    setError(null);

    try {
      log("starting code-server");
      const { url, error } = await client.editor.start();
      if (!url) {
        throw new Error(error || "Url is empty");
      }
      // TODO: refactor with 统一的埋点体系, replace raw CustomEvent dispatching
      window.dispatchEvent(
        new CustomEvent("neovate:log-event", {
          detail: { key: "EDITOR_STARTED" },
        }),
      );
      // Construct URL with folder query param
      const editorUrl = `${url}/?folder=${encodeURIComponent(cwd)}`;
      log("server ready at %s", editorUrl);

      setServerUrl(editorUrl);
      // FIXME: 不延迟的话有概率初始化失败
      setTimeout(() => {
        setStatus("ready");
      }, 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start editor";
      log("start failed: %s", message);
      setError(message);
      setStatus("error");
    }
  };

  const renderHolder = () => {
    if (status === "error" && error) {
      return <ErrorState message={error} onRetry={startEditor} />;
    }
    if (status !== "ready" || !serverUrl) {
      return <LoadingState status={status} />;
    }
    return null;
  };

  const renderOverlay = () => {
    if (status === "starting" || !serverUrl || tabs.length > 0) {
      return null;
    }

    const message = !extReady
      ? t("editor.overlay.extensionPreparing")
      : t("editor.overlay.noFileOpened");

    return (
      <div className="absolute inset-0 z-10 bg-card backdrop-blur-sm flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img
            src={
              resolvedTheme === "dark"
                ? "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*hgaTTZvoTicAAAAAQDAAAAgAenyRAQ/original"
                : "https://mdn.alipayobjects.com/huamei_puljkc/afts/img/A*Wrd1TL3S_pYAAAAAQFAAAAgAenyRAQ/original"
            }
            alt="Editor Logo"
            className="w-32 h-24 object-contain"
          />
          <p className="text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  };

  return (
    <>
      {renderHolder()}
      {!!serverUrl && (
        <div className="relative flex-1 w-full h-full">
          <webview
            ref={webviewRef}
            src={serverUrl}
            title="Code Editor"
            className="absolute inset-0 w-full h-full border-0 bg-background"
          />
          {renderOverlay()}
        </div>
      )}
    </>
  );
}

export default function EditorView() {
  const activeProject = useProjectStore((state) => state.activeProject);
  return <EditorViewCore cwd={activeProject?.path || ""} />;
}
