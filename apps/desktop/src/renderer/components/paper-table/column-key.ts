import type { PaperColumns } from '../../../shared/contract.js'
import { GROUPABLE_PAPER_FIELDS, PAPER_COLUMNS } from '../../../shared/vocabulary.js'
import { nextKey } from '../../lib/slug.js'

// The contract only accepts the key [A-Za-z0-9_-], but slugOf keeps CJK as a letter, so first fold it into -
const NON_KEY = /[^A-Za-z0-9_-]+/g

/**
 * The keys that can be used for the column `label`: Illegal characters are folded into `-`, which are the same as those existing in `columns`, built-in columns, groupable fields,
 * When the sentinel `none` or `Object.prototype` of the grouping column hits the property name, it is followed by `-2` and `-3`.
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
