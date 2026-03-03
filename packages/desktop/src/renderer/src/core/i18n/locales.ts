export const DEFAULT_LOCALE = 'en-US' as const

export const locales = ['en-US', 'zh-CN'] as const

export type Locales = (typeof locales)[number]

export interface LocaleOption {
  label: string
  value: Locales
}

export const localeOptions: LocaleOption[] = [
  { label: 'English', value: 'en-US' },
  { label: '简体中文', value: 'zh-CN' },
]

/** Map a raw BCP-47 tag (e.g. "zh", "en-GB") to a supported Locales value. */
export function normalizeLocale(raw: string): Locales {
  if ((locales as readonly string[]).includes(raw)) return raw as Locales
  if (raw.startsWith('zh')) return 'zh-CN'
  return DEFAULT_LOCALE
}
