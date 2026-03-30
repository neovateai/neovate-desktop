import type { RendererPlugin } from "./types";

export interface Contribution<T> {
  readonly plugin: RendererPlugin;
  readonly value: T;
}

export function contribution<T>(plugin: RendererPlugin, value: T): Contribution<T> {
  return { plugin, value };
}
