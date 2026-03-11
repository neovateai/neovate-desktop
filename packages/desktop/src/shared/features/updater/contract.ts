import { oc, type, eventIterator } from "@orpc/contract";

import type { UpdaterState } from "./types";

export const updaterContract = {
  check: oc.output(type<void>()),
  install: oc.output(type<void>()),
  getVersion: oc.output(type<string>()),
  subscribe: oc.output(eventIterator(type<UpdaterState>())),
};
