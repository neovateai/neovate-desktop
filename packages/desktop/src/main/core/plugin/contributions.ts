import type { AnyRouter } from "@orpc/server";

import type { Contribution } from "./contribution";

export type Contributions = {
  routers: Contribution<AnyRouter>[];
};
