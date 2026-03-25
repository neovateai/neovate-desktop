import { ElectronAPI } from "@electron-toolkit/preload";

interface NeovateApi {
  homedir: string;
  isDev: boolean;
  onOpenSettings: (callback: () => void) => () => void;
  onDeeplink: (callback: (data: { sessionId: string; project: string }) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: NeovateApi;
  }
}
