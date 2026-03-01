export interface Disposable {
  dispose(): void;
}

export function toDisposable(fn: () => void): Disposable {
  return { dispose: fn };
}

export class DisposableStore {
  private items: Disposable[] = [];

  push(...disposables: Disposable[]): void {
    this.items.push(...disposables);
  }

  dispose(): void {
    const copy = this.items.splice(0);
    for (const item of copy) {
      item.dispose();
    }
  }
}
