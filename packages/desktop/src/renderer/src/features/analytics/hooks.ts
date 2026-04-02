import { useEffect } from "react";

import { client } from "../../orpc";

export function useTrackPageView(page: string) {
  useEffect(() => {
    client.analytics.track({ event: "ui.page.viewed", properties: { page } }).catch(() => {});
  }, [page]);
}
