import type { PaperColumns } from '../../../shared/contract.js'
import { GROUPABLE_PAPER_FIELDS, PAPER_COLUMNS } from '../../../shared/vocabulary.js'
import { nextKey } from '../../lib/slug.js'

// The contract allows only [A-Za-z0-9_-] in keys, but slugOf keeps CJK as letters; fold the rest into -
const NON_KEY = /[^A-Za-z0-9_-]+/g

/**
 * A usable key for a column named `label`: characters a key cannot hold fold into `-`, and on a
 * collision with a key in `columns`, a built-in column, a groupable field, the group sentinel
 * `none` or a property name of `Object.prototype`, `-2`, `-3`… is appended.
 */
export function columnKey(label: string, columns: PaperColumns): string {
  return nextKey(label.replace(NON_KEY, '-'), [
    ...columns.custom.map((c) => c.key), ...PAPER_COLUMNS, ...GROUPABLE_PAPER_FIELDS, 't',
    'none', ...Object.getOwnPropertyNames(Object.prototype),
  ])
}

/**
 * Does the table already have a column called `label`? The title column and built-in columns also
 * count, named by `builtinLabels` in the active language.
 */
export function takenLabel(label: string, columns: PaperColumns, builtinLabels: readonly string[]): boolean {
  return builtinLabels.includes(label) || columns.custom.some((c) => c.label === label)
}
