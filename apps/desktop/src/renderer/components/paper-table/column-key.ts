import type { PaperColumns } from '../../../shared/contract.js'
import { GROUPABLE_PAPER_FIELDS, PAPER_COLUMNS } from '../../../shared/vocabulary.js'
import { nextKey } from '../../lib/slug.js'
import type { Catalog } from '../../messages/catalog.js'

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
 * The names the built-in columns and group fields show beside `columns`' custom ones: the catalog's,
 * except that the read state shows its earlier name, `stTaken`, while a custom column holds its name,
 * so no two columns show one name.
 */
export function builtinNames(m: Catalog, columns: PaperColumns): Pick<Catalog['papers'], 'columns' | 'groupNames'> {
  const { columns: names, groupNames } = m.papers
  const held = columns.custom.some((c) => c.label === names.st || c.label === groupNames.readState)
  return held
    ? { columns: { ...names, st: names.stTaken }, groupNames: { ...groupNames, readState: names.stTaken } }
    : { columns: names, groupNames }
}

/**
 * Does the table already have a column called `label`? The title column and built-in columns also
 * count, named by `builtinLabels` in the active language.
 */
export function takenLabel(label: string, columns: PaperColumns, builtinLabels: readonly string[]): boolean {
  return builtinLabels.includes(label) || columns.custom.some((c) => c.label === label)
}
