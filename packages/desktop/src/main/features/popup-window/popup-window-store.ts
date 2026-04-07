import Store from "electron-store";

import { APP_DATA_DIR } from "../../core/app-paths";

type PopupWindowState = {
  width: number;
  height: number;
};

const DEFAULTS: PopupWindowState = {
  width: 480,
  height: 320,
};

export class PopupWindowStore {
  #store = new Store<PopupWindowState>({
    name: "popup-window-state",
    cwd: APP_DATA_DIR,
    defaults: DEFAULTS,
    serialize: (value) => JSON.stringify(value, null, 2) + "\n",
  });

  getSize(): { width: number; height: number } {
    return {
      width: this.#store.get("width"),
      height: this.#store.get("height"),
    };
  }

  saveSize(width: number, height: number): void {
    this.#store.set("width", width);
    this.#store.set("height", height);
  }
}
