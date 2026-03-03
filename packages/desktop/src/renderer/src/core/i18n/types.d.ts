import type enUS from '../../locales/en-US.json'

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: {
      translation: typeof enUS
    }
  }
}
