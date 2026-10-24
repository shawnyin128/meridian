import type { Locale } from '../shell/language.js'

const NUMBERS: Record<Locale, Intl.NumberFormat> = {
  zh: new Intl.NumberFormat('zh-CN'),
  en: new Intl.NumberFormat('en-US'),
}

/** Writes `value` with `locale`'s digit grouping, such as 12,345. Catalog modules call this directly. */
export function formatNumber(locale: Locale, value: number): string {
  return NUMBERS[locale].format(value)
}
