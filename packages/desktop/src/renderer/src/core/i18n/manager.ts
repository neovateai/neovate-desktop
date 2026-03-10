import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import enUS from "../../locales/en-US.json";
import zhCN from "../../locales/zh-CN.json";
import { DEFAULT_LOCALE, normalizeLocale, type Locales } from "./locales";

export type I18nStore = {
  getState: () => {
    locale: Locales;
    setLocale: (locale: Locales) => void;
  };
};

export type I18nInitOptions = { store?: I18nStore };
export type I18nResourceBundle = Record<string, unknown>;

/**
 * Config for lazy-loaded i18n namespace.
 */
export interface LazyNamespaceConfig {
  namespace: string;
  loader: (locale: Locales) => Promise<I18nResourceBundle>;
}

export class I18nManager {
  private lazyNamespacesLoaded = new Map<string, Set<Locales>>();

  constructor() {
    // Use the global i18n instance so useTranslation hook works
    i18n.use(initReactI18next).use(LanguageDetector);
  }

  get getInstance(): typeof i18n {
    return i18n;
  }

  async init(options: I18nInitOptions = {}): Promise<void> {
    const { store } = options;

    // Get locale from store or browser detection
    const savedLocale = store?.getState().locale;

    await i18n.init({
      resources: {
        "en-US": { translation: enUS },
        "zh-CN": { translation: zhCN },
      },
      fallbackLng: DEFAULT_LOCALE,
      load: "currentOnly",
      keySeparator: false,
      // Use saved locale, or detect from browser
      ...(savedLocale
        ? { lng: savedLocale }
        : {
            detection: {
              order: ["navigator"],
              caches: [],
              convertDetectedLanguage: (lng: string) => normalizeLocale(lng),
            },
          }),
      react: {
        useSuspense: false,
        bindI18n: "languageChanged loaded",
      },
    });

    // If no preference was saved, save detected locale to store
    if (store && !savedLocale) {
      const detectedLocale = normalizeLocale(i18n.language);
      store.getState().setLocale(detectedLocale);
    }
  }

  async applyUILocale(locale: Locales | null): Promise<void> {
    const normalized = normalizeLocale(
      locale ?? (typeof navigator !== "undefined" ? navigator.language : undefined),
    );

    if (normalized !== i18n.language) {
      await i18n.changeLanguage(normalized);
    }

    if (typeof document !== "undefined") {
      document.documentElement.lang = normalized;
    }
  }

  registerResources(
    namespace: string,
    resources: Partial<Record<Locales, I18nResourceBundle>>,
  ): void {
    Object.entries(resources).forEach(([lng, bundle]) => {
      if (!bundle) return;
      i18n.addResourceBundle(lng, namespace, bundle, true, true);
    });
  }

  onLanguageChanged(handler: (lng: string) => void): () => void {
    i18n.on("languageChanged", handler);
    return () => i18n.off("languageChanged", handler);
  }

  /**
   * Setup lazy-loaded i18n namespaces.
   *
   * As a core module, I18nManager is designed to be extensible.
   * Callers can register namespaces that load resources on-demand
   * when the locale changes.
   */
  setupLazyNamespaces(configs: LazyNamespaceConfig[]): void {
    if (!configs.length) return;

    // Load current locale
    void this.loadLazyNamespaces(configs, normalizeLocale(i18n.language));

    // Listen for language changes
    this.onLanguageChanged((lng) => {
      void this.loadLazyNamespaces(configs, normalizeLocale(lng));
    });
  }

  private async loadLazyNamespaces(configs: LazyNamespaceConfig[], locale: Locales): Promise<void> {
    await Promise.all(
      configs.map(async (config) => {
        const loaded = this.lazyNamespacesLoaded.get(config.namespace) ?? new Set();
        if (loaded.has(locale)) return;

        try {
          const bundle = await config.loader(locale);
          this.registerResources(config.namespace, { [locale]: bundle });
          loaded.add(locale);
          this.lazyNamespacesLoaded.set(config.namespace, loaded);
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn("[i18n] Failed to load lazy namespace", {
              namespace: config.namespace,
              locale,
              error,
            });
          }
        }
      }),
    );
  }
}
