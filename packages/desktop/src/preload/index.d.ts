import { ElectronAPI } from "@electron-toolkit/preload";

interface NeovateApi {
  homedir: string;
  isDev: boolean;
  onOpenSettings: (callback: () => void) => () => void;
  onPopupWindowShown: (callback: () => void) => () => void;
  onFullScreenChange: (callback: (isFullScreen: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: NeovateApi;
  }
}
