import { useEffect, useRef, useState } from "react";
import { usePluginContext } from "../../core/app";
import { ContractRouterClient } from "@orpc/contract";
import { editorContract } from "../../../../shared/plugins/editor/contract";
import { useProjectStore } from "../../features/project/store";
import { EditorStatus } from "./type";
import { ErrorState, LoadingState } from "./status";

type EditorClient = ContractRouterClient<{ editor: typeof editorContract }>;

function EditorViewCore(props: { cwd: string }) {
  const { cwd = "" } = props;
  const [serverUrl, setServerUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [status, setStatus] = useState<EditorStatus>("idle");
  const initRef = useRef(false);

  const { orpcClient } = usePluginContext();
  const client = orpcClient as EditorClient;

  useEffect(() => {
    if (initRef.current && status === "ready") return;
    initRef.current = true;
    const disposable = connectToExtension();
    startEditor();
    return () => {
      disposable.forEach((fn) => fn());
    };
  }, []);

  const connectToExtension = () => {
    const disposable: Array<() => void> = [];
    client.editor.connect({ cwd }).then(() => {
      console.log("Extension connected");

      const openEditor = (fullPath: string, line: number) => {
        if (!fullPath) {
          return;
        }
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
      disposable.push(() => {
        window.addEventListener("neovate:open-editor", openEditorEvent);
      });
    });

    return disposable;
  };

  const startEditor = async () => {
    if (status === "starting") return;

    setStatus("starting");
    setError(null);

    try {
      console.log("[EditorPane] Starting code-server...");
      const { url } = await client.editor.start();
      // Construct URL with folder query param
      const editorUrl = `${url}/?folder=${encodeURIComponent(cwd)}`;
      console.log("[EditorPane] Server ready at:", editorUrl);

      setServerUrl(editorUrl);
      // FIXME: 不延迟的话有概率初始化失败
      setTimeout(() => {
        setStatus("ready");
      }, 100);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start editor";
      console.log("[EditorPane] Start failed:", message);
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
          className={`flex-1 w-full h-full border-0 bg-background min-h-0 block"}`}
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
