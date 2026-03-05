import Store from "electron-store";

type StateSchema = Record<string, unknown>;

export class StateStore {
  private store: Store<StateSchema>;

  constructor() {
    this.store = new Store<StateSchema>({
      name: "state",
      defaults: {},
    });
  }

  load(key: string): unknown {
    return this.store.get(key) ?? null;
  }

  save(key: string, data: unknown): void {
    this.store.set(key, data);
  }
}
