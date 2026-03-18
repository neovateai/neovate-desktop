export type UpdaterState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "up-to-date" }
  | { status: "available"; version: string }
  | { status: "downloading"; version: string; percent: number }
  | { status: "ready"; version: string }
  | { status: "error"; message: string };

export interface IUpdateService {
  readonly state: UpdaterState;
  onStateChange(cb: (state: UpdaterState) => void): () => void;
  check(manual?: boolean): void;
  install(): void;
}
