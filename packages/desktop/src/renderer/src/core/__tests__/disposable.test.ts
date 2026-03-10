import { describe, it, expect, vi } from "vitest";

import { DisposableStore, toDisposable } from "../disposable";

describe("toDisposable", () => {
  it("wraps a function into a Disposable", () => {
    const fn = vi.fn();
    const d = toDisposable(fn);
    d.dispose();
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("DisposableStore", () => {
  it("disposes all pushed disposables", () => {
    const store = new DisposableStore();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    store.push(toDisposable(fn1), toDisposable(fn2));
    store.dispose();
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });

  it("clears the store after dispose", () => {
    const store = new DisposableStore();
    const fn = vi.fn();
    store.push(toDisposable(fn));
    store.dispose();
    store.dispose(); // second call should not re-invoke
    expect(fn).toHaveBeenCalledOnce();
  });

  it("accepts plain functions via push", () => {
    const store = new DisposableStore();
    const fn = vi.fn();
    store.push(fn);
    store.dispose();
    expect(fn).toHaveBeenCalledOnce();
  });

  it("accepts mixed Disposable and () => void", () => {
    const store = new DisposableStore();
    const fn1 = vi.fn();
    const fn2 = vi.fn();
    store.push(toDisposable(fn1), fn2);
    store.dispose();
    expect(fn1).toHaveBeenCalledOnce();
    expect(fn2).toHaveBeenCalledOnce();
  });
});
