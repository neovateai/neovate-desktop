import { useEffect } from "react";

import { track } from "./track";

export function useTrackPageView(page: string) {
  useEffect(() => {
    track("ui.page.viewed", { page });
  }, [page]);
}
