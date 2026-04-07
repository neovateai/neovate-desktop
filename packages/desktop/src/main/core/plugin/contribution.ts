import type { MainPlugin } from "./types";

export interface Contribution<T> {
  readonly plugin: MainPlugin;
  readonly value: T;
}

export function contribution<T>(plugin: MainPlugin, value: T): Contribution<T> {
  return { plugin, value };
}
