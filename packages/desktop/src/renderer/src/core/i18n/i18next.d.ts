import "i18next";
import type enUS from "../../locales/en-US.json";
import type { Locales } from "./locales";

export interface I18nContributions {
  namespace: string;
  loader: (locale: Locales) => Promise<Record<string, string>>;
}

declare module "i18next" {
  interface I18nResources {
    translation: typeof enUS;
  }

  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: I18nResources;
  }
}
