import type { Locales } from "./locales";

export interface I18nContributions {
  namespace: string;
  loader: (locale: Locales) => Promise<Record<string, string>>;
}
