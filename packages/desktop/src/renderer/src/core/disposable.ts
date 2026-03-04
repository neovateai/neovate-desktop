export interface Disposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): Disposable {
  return { dispose: fn };
}

export type Unsubscribe = () => void;

export class DisposableStore {
  private items: (Disposable | Unsubscribe)[] = [];

  push(...disposables: (Disposable | Unsubscribe)[]): void {
    this.items.push(...disposables);
  }

  dispose(): void {
    const copy = this.items.splice(0);
    for (const item of copy) {
      typeof item === "function" ? item() : item.dispose();
    }
  }
}
