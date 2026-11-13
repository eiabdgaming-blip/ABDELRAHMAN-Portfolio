export const textDirection = {
  en: 'ltr',
  ar: 'rtl',
} as const

export type ContentLocale = keyof typeof textDirection

export const defaultLocale = 'en' satisfies ContentLocale

export interface LocalizedText {
  readonly value: string
  readonly locale: ContentLocale
}
