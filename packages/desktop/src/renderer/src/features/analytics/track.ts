import type {
  ProgrammaticEventName,
  ProgrammaticEventProperties,
} from "../../../../shared/features/analytics/events";

import { client } from "../../orpc";

export function track<T extends ProgrammaticEventName>(
  event: T,
  properties: ProgrammaticEventProperties<T>,
): void {
  client.analytics
    .track({ event, properties: { ...properties, trackType: "programmatic" } })
    .catch(() => {});
}
