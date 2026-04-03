import { ElectronAPI } from "@electron-toolkit/preload";

interface NeovateApi {
  homedir: string;
  isDev: boolean;
  onOpenSettings: (callback: () => void) => () => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
    api: NeovateApi;
  }
}
