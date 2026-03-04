/**
 * Locale definitions and utilities
 */

export const DEFAULT_LOCALE = "en-US" as const;

export const locales = ["en-US", "zh-CN"] as const;

export type Locales = (typeof locales)[number];

export const normalizeLocale = (locale?: string): Locales => {
  if (!locale) return DEFAULT_LOCALE;

  // Exact match
  for (const l of locales) {
    if (l === locale) return l;
  }

  // Prefix match (e.g., 'zh' -> 'zh-CN', 'en' -> 'en-US')
  if (locale.startsWith("zh")) return "zh-CN";
  if (locale.startsWith("en")) return "en-US";

  return DEFAULT_LOCALE;
};

export function isSupportedLanguage(value: string): value is Locales {
  return locales.includes(value as Locales);
}

type LocaleOption = {
  label: string;
  value: Locales;
};

export const localeOptions: LocaleOption[] = [
  { label: "English", value: "en-US" },
  { label: "简体中文", value: "zh-CN" },
];
