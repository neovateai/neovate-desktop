import "i18next";
import type enUS from "./locales/en-US.json";

declare module "i18next" {
  interface I18nResources {
    "plugin-editor": typeof enUS;
  }
}
