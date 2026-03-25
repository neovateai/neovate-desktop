import type { IpcRendererEvent } from "electron";

import { electronAPI } from "@electron-toolkit/preload";
import debug from "debug";
import { contextBridge, ipcRenderer } from "electron";
import { homedir } from "node:os";

import type {
  DeepLinkActionEvent,
  DeepLinkOpenRequest,
} from "../shared/features/electron/deeplink";

const log = debug("neovate:orpc:preload");
let pendingDeepLinkOpenRequest: DeepLinkOpenRequest | null = null;
let pendingDeepLinkAction: DeepLinkActionEvent | null = null;

window.addEventListener("message", (event) => {
  if (event.data === "start-orpc-client") {
    const [serverPort] = event.ports;
    log("forwarding start-orpc-server");
    ipcRenderer.postMessage("start-orpc-server", null, [serverPort]);
  }
});

ipcRenderer.on("deeplink:request-open", (_event, request: DeepLinkOpenRequest) => {
  pendingDeepLinkOpenRequest = request;
});

ipcRenderer.on("deeplink:action", (_event, action: DeepLinkActionEvent) => {
  pendingDeepLinkAction = action;
});

// API for renderer process (menu commands, etc.)
const api = {
  homedir: homedir(),
  onOpenSettings: (callback: () => void) => {
    ipcRenderer.on("menu:open-settings", callback);
    return () => ipcRenderer.removeListener("menu:open-settings", callback);
  },
  // Host-internal bridge used by the main renderer app to refresh project state before plugins act.
  onDeepLinkOpenRequest: (callback: (request: DeepLinkOpenRequest) => void) => {
    const listener = (_event: IpcRendererEvent, request: DeepLinkOpenRequest) => {
      pendingDeepLinkOpenRequest = null;
      callback(request);
    };
    ipcRenderer.on("deeplink:request-open", listener);

    const pendingRequest = pendingDeepLinkOpenRequest;
    if (pendingRequest) {
      pendingDeepLinkOpenRequest = null;
      callback(pendingRequest);
    }

    return () => ipcRenderer.removeListener("deeplink:request-open", listener);
  },
  // Host-internal ACK used once the renderer has refreshed to the requested project.
  confirmDeepLinkProjectReady: (id: string, projectPath: string) =>
    ipcRenderer.send("deeplink:project-ready", { id, projectPath }),
  onDeepLinkAction: (callback: (action: DeepLinkActionEvent) => void) => {
    const listener = (_event: IpcRendererEvent, action: DeepLinkActionEvent) => {
      pendingDeepLinkAction = null;
      callback(action);
    };
    ipcRenderer.on("deeplink:action", listener);

    const pendingAction = pendingDeepLinkAction;
    if (pendingAction) {
      pendingDeepLinkAction = null;
      callback(pendingAction);
    }

    return () => ipcRenderer.removeListener("deeplink:action", listener);
  },
};

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("electron", electronAPI);
    contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
}
