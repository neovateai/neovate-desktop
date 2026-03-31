import type { AnyRouter } from "@orpc/server";

import type { DeeplinkHandler } from "../deeplink/types";
import type { Contribution } from "./contribution";

export type Contributions = {
  routers: Contribution<AnyRouter>[];
  deeplinkHandlers: Contribution<DeeplinkHandler>[];
};
