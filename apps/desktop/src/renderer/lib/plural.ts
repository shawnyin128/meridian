const EN = new Intl.PluralRules('en-US')

/** Picks the English form for `count`. Catalog modules call this directly. */
export function pluralEn(count: number, forms: { one: string; other: string }): string {
  return EN.select(count) === 'one' ? forms.one : forms.other
}
