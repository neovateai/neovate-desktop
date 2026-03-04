import { oc, type } from "@orpc/contract";

export const storageContract = {
  get: oc
    .input(type<{ namespace: string; key: string; defaultValue?: unknown }>())
    .output(type<unknown>()),
  set: oc.input(type<{ namespace: string; key: string; value: unknown }>()).output(type<void>()),
  setMany: oc
    .input(type<{ namespace: string; object: Record<string, unknown> }>())
    .output(type<void>()),
  has: oc.input(type<{ namespace: string; key: string }>()).output(type<boolean>()),
  delete: oc.input(type<{ namespace: string; key: string }>()).output(type<void>()),
  appendToArray: oc
    .input(type<{ namespace: string; key: string; value: unknown }>())
    .output(type<void>()),
  getAll: oc.input(type<{ namespace: string }>()).output(type<Record<string, unknown>>()),
};
