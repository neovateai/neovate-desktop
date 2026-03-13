import type { RendererPlugin } from "../../core/plugin/types";

import { BUILT_IN_PROVIDER_TEMPLATES } from "../../../../shared/features/provider/templates";

export const providersPlugin: RendererPlugin = {
  name: "providers",
  configContributions() {
    return {
      providerTemplates: BUILT_IN_PROVIDER_TEMPLATES,
    };
  },
};
