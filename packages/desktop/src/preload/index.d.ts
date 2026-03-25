import { ElectronAPI } from "@electron-toolkit/preload";

import type {
  DeepLinkActionEvent,
  DeepLinkOpenRequest,
} from "../shared/features/electron/deeplink";

interface NeovateApi {
  homedir: string;
  onOpenSettings: (callback: () => void) => () => void;
  onDeepLinkOpenRequest: (callback: (request: DeepLinkOpenRequest) => void) => () => void;
  confirmDeepLinkProjectReady: (id: string, projectPath: string) => void;
  onDeepLinkAction: (callback: (action: DeepLinkActionEvent) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: NeovateApi;
  }
}
