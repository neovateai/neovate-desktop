import { consumeEventIterator } from "@orpc/client";
import { ContractRouterClient } from "@orpc/contract";
import debug from "debug";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

const log = debug("neovate:editor:view");

import { editorContract } from "../../../../shared/plugins/editor/contract";
import { usePluginContext } from "../../core/app";
import { useProjectStore } from "../../features/project/store";
import { ErrorState, LoadingState } from "./status";
import { EditorStatus } from "./type";

type EditorClient = ContractRouterClient<{ editor: typeof editorContract }>;

function EditorViewCore(props: { cwd: string }) {
  const { cwd = "" } = props;
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<EditorStatus>("idle");
  const initRef = useRef(false);
  const [extReady, seExtReady] = useState(false); // vscode 扩展就绪情况
  const { resolvedTheme } = useTheme();

  const { orpcClient } = usePluginContext();
  const client = orpcClient as EditorClient;

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
      log("setting theme", { theme: resolvedTheme });
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
        const { type, detail } = e || {};
        log("editor events received", e);
        switch (type) {
          case "context.add":
            // add context [file]
            if (detail?.type === "file" && !!detail?.data?.relPath) {
              const filePath = detail.data.relPath;
              window.dispatchEvent(
                new CustomEvent("neovate:insert-chat", {
                  detail: {
                    mentions: [{ id: filePath, label: filePath }],
                  },
                }),
              );
            }
            return;
          default:
            return;
        }
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
      const openEditor = (fullPath: string, line: number) => {
        if (!fullPath) {
          return;
        }
        log("opening file", { fullPath, line });
        client.editor.open({ cwd, filePath: fullPath, line });
        // @ts-ignore 清理
        window.pendingEditorRequest = undefined;
      };
      // @ts-ignore 避免初始化前未收到事件
      const pendingEditorRequest = window.pendingEditorRequest as {
        fullPath: string;
        line?: number;
      };
      if (pendingEditorRequest?.fullPath) {
        openEditor(pendingEditorRequest.fullPath, pendingEditorRequest.line || 1);
      }

      // 连接成功后初始化插件可接受的操作事件响应函数
      const openEditorEvent = (e: Event) => {
        const { fullPath = "", line = 1 } =
          (e as CustomEvent<{ fullPath: string; line?: number }>)?.detail || {};
        openEditor(fullPath, line);
      };
      window.addEventListener("neovate:open-editor", openEditorEvent);

      return () => {
        window.addEventListener("neovate:open-editor", openEditorEvent);
      };
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

  return (
    <>
      {renderHolder()}
      {!!serverUrl && (
        <iframe
          ref={iframeRef}
          src={serverUrl}
          title="Code Editor"
          className={`flex-1 w-full h-full border-0 bg-background min-h-0 block`}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
        />
      )}
    </>
  );
}

export default function EditorView() {
  const activeProject = useProjectStore((state) => state.activeProject);
  return <EditorViewCore cwd={activeProject?.path || ""} />;
}
