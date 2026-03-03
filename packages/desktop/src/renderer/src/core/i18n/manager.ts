import i18n, { type i18n as I18nInstance } from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

import enUS from '../../locales/en-US.json'
import zhCN from '../../locales/zh-CN.json'
import { DEFAULT_LOCALE, normalizeLocale, type Locales } from './locales'

export class I18nManager {
  private instance: I18nInstance

  constructor() {
    this.instance = i18n.createInstance()
  }

  get getInstance(): I18nInstance {
    return this.instance
  }

  async init(): Promise<void> {
    await this.instance
      .use(LanguageDetector)
      .use(initReactI18next)
      .init({
        resources: {
          'en-US': { translation: enUS },
          'zh-CN': { translation: zhCN },
        },
        fallbackLng: DEFAULT_LOCALE,
        load: 'currentOnly',
        keySeparator: false,
        interpolation: { escapeValue: false },
        react: { useSuspense: false, bindI18n: 'languageChanged loaded' },
        detection: {
          order: ['localStorage', 'navigator'],
          caches: ['localStorage'],
          lookupLocalStorage: 'neovate:locale',
        },
      })
  }

  applyUILocale(locale: Locales): void {
    const normalized = normalizeLocale(locale)
    this.instance.changeLanguage(normalized)
    document.documentElement.lang = normalized
    localStorage.setItem('neovate:locale', normalized)
  }

  get currentLocale(): Locales {
    return normalizeLocale(this.instance.language ?? DEFAULT_LOCALE)
  }
}
