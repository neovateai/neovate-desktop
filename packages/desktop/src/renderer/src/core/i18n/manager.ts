import i18n, { type i18n as I18nInstance } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enUS from "../../locales/en-US.json";
import zhCN from "../../locales/zh-CN.json";
import { DEFAULT_LOCALE, locales, normalizeLocale, type Locales } from "./locales";

export class I18nManager {
  private instance: I18nInstance;

  constructor() {
    this.instance = i18n.createInstance();
  }

  get i18n(): I18nInstance {
    return this.instance;
  }

  async init(): Promise<void> {
    await this.instance
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources: {
          "en-US": { translation: enUS },
          "zh-CN": { translation: zhCN },
        },
        supportedLngs: locales,
        fallbackLng: DEFAULT_LOCALE,
        load: "currentOnly",
        keySeparator: false,
        interpolation: { escapeValue: false },
        react: { useSuspense: false, bindI18n: "languageChanged loaded" },
        detection: {
          order: ["localStorage", "navigator"],
          caches: ["localStorage"],
          lookupLocalStorage: "neovate:locale",
          convertDetectedLanguage: (lng) => normalizeLocale(lng),
        },
      });

    const normalized = normalizeLocale(
      this.instance.resolvedLanguage ?? this.instance.language ?? DEFAULT_LOCALE,
    );
    await this.instance.changeLanguage(normalized);
    this.persistLocale(normalized);
  }

  applyUILocale(locale: Locales): void {
    const normalized = normalizeLocale(locale);
    void this.instance.changeLanguage(normalized);
    this.persistLocale(normalized);
  }

  get currentLocale(): Locales {
    return normalizeLocale(
      this.instance.resolvedLanguage ?? this.instance.language ?? DEFAULT_LOCALE,
    );
  }

  private persistLocale(locale: Locales): void {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
    if (typeof localStorage !== "undefined") {
      localStorage.setItem("neovate:locale", locale);
    }
  }
}
