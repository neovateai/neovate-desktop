import { oc, type } from "@orpc/contract";

/**
 * Generic key-value storage contract backed by electron-store (conf).
 *
 * electron-store API notes:
 *   store.get(key, defaultValue?)  — reads a single key; returns defaultValue if absent
 *   store.set(key, value)          — writes a single key (dot-notation supported for nesting)
 *   store.set(object)              — SHALLOW merge: merges top-level keys, does NOT replace the
 *                                    entire file; existing keys not in `object` are preserved
 *   store.has(key)                 — checks existence (dot-notation supported)
 *   store.delete(key)              — removes a key (dot-notation supported)
 *   store.store                    — returns the full plain object for the namespace
 */
export const storageContract = {
  /** Read a single key. Returns `defaultValue` (or undefined) when the key is absent. */
  get: oc
    .input(type<{ namespace: string; key: string; defaultValue?: unknown }>())
    .output(type<unknown>()),

  /** Write a single key. Supports dot-notation (e.g. "a.b.c" creates nested structure). */
  set: oc.input(type<{ namespace: string; key: string; value: unknown }>()).output(type<void>()),

  /**
   * Shallow-merge an object into the namespace.
   * Top-level keys in `object` overwrite existing values; all other keys are preserved.
   * Does NOT deep-merge nested objects — use `set` with dot-notation for that.
   */
  merge: oc
    .input(type<{ namespace: string; object: Record<string, unknown> }>())
    .output(type<void>()),

  /** Returns true if the key exists (dot-notation supported). */
  has: oc.input(type<{ namespace: string; key: string }>()).output(type<boolean>()),

  /** Deletes a key (dot-notation supported). */
  delete: oc.input(type<{ namespace: string; key: string }>()).output(type<void>()),

  /**
   * Appends a value to an array stored at `key`.
   * Creates the array if it does not exist yet.
   */
  appendToArray: oc
    .input(type<{ namespace: string; key: string; value: unknown }>())
    .output(type<void>()),

  /** Returns all data in the namespace as a plain object. */
  getAll: oc.input(type<{ namespace: string }>()).output(type<Record<string, unknown>>()),
};
