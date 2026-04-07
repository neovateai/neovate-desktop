import { useCallback } from "react";

import type {
  ProgrammaticEventName,
  ProgrammaticEventProperties,
} from "../../../../../shared/features/analytics/events";

import { useRendererApp } from "../../../core/app";

export function useAnalyticsTrack() {
  const app = useRendererApp();
  return useCallback(
    <T extends ProgrammaticEventName>(event: T, properties: ProgrammaticEventProperties<T>) => {
      Promise.resolve(
        app.analytics.track(event, { ...properties, trackType: "programmatic" }),
      ).catch(() => {});
    },
    [app],
  );
}
