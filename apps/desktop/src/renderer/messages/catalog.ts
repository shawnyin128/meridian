import type { Locale } from '../shell/language.js'
import { en } from './en/index.js'
import { zh } from './zh/index.js'

/** The message catalog every screen reads. The Chinese modules define its shape. */
export type Catalog = typeof zh

/** The catalog for one locale. Both are bundled so switching needs no load. */
export function catalogFor(locale: Locale): Catalog {
  return locale === 'zh' ? zh : en
}
