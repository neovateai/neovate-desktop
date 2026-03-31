import { oc, type, eventIterator } from "@orpc/contract";

export interface DeeplinkEvent {
  name: string;
  path: string;
  searchParams: Record<string, string>;
  data?: unknown;
  /** true when no main-process handler was registered for this name */
  unhandled: boolean;
}

export const deeplinkContract = {
  subscribe: oc.output(eventIterator(type<DeeplinkEvent>())),
};
