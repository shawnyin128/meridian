const NUMBERS = {
  zh: new Intl.NumberFormat('zh-CN'),
  en: new Intl.NumberFormat('en-US'),
}

/** Writes `value` with `locale`'s digit grouping, such as 12,345. Catalog modules call this directly. */
export function formatNumber(locale: keyof typeof NUMBERS, value: number): string {
  return NUMBERS[locale].format(value)
}
