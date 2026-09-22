import type { PaperCell, PaperColumn, PaperColumns, PaperRow } from '../../shared/contract.js'
import {
  COLUMN_TYPE_LABEL, DEFAULT_PAPER_GROUPS, GROUPABLE_PAPER_FIELDS, LOCKED_PAPER_COLUMNS, PAPER_COLUMNS,
} from '../../shared/vocabulary.js'

const KEY = /^[A-Za-z0-9_-]+$/
// `none` is the ungrouped sentinel, while Object.prototype names can masquerade as mapped values; neither may be a custom-column key.
const RESERVED_KEYS = new Set(['none', ...Object.getOwnPropertyNames(Object.prototype)])

/** Default column configuration for an untouched library, with every built-in column visible. */
export const emptyColumns = (): PaperColumns => ({ hidden: [], custom: [], groups: [...DEFAULT_PAPER_GROUPS] })

/**
 * Returns `columns` without the keys that name nothing the table has now: `hidden` keeps only
 * built-in columns, `groups` only groupable built-in fields and select or multi columns of
 * `columns`, and `order` only built-in and custom columns. Everything else is kept as it is.
 */
export function liveColumns(columns: PaperColumns): PaperColumns {
  const builtIn = (key: string) => (PAPER_COLUMNS as readonly string[]).includes(key)
  const custom = (key: string) => columns.custom.find((c) => c.key === key)
  return {
    ...columns,
    hidden: columns.hidden.filter(builtIn),
    groups: columns.groups.filter((key) => (GROUPABLE_PAPER_FIELDS as readonly string[]).includes(key)
      || (custom(key)?.type ?? 'text') !== 'text'),
    ...(columns.order === undefined
      ? {}
      : { order: columns.order.filter((key) => builtIn(key) || custom(key) !== undefined) }),
  }
}

/** Own value of `map` at `key`; inherited Object.prototype names count as absent. */
function ownCell(map: PaperRow['custom'], key: string): PaperCell | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined
}

/** Whether two cells have the same value: both empty, identical text, or identical ordered values. */
function sameCell(a: PaperCell | undefined, b: PaperCell | undefined): boolean {
  return Array.isArray(a) && Array.isArray(b)
    ? a.length === b.length && a.every((value, at) => value === b[at])
    : a === b
}

/** Values stored for this paper in column `key`; empty cells have none and multiselect values count individually. */
export function cellValues(row: PaperRow, key: string): string[] {
  const cell = ownCell(row.custom, key)
  if (cell === undefined) return []
  return Array.isArray(cell) ? cell : [cell]
}

/** Throws unless `key` names a built-in groupable field or a select or multi column in `columns`. */
export function checkGroupKey(key: string, columns: PaperColumns): void {
  if ((GROUPABLE_PAPER_FIELDS as readonly string[]).includes(key)) return
  const column = columns.custom.find((c) => c.key === key)
  if (column === undefined || column.type === 'text') throw new Error(`不能按这一列分组:${key}`)
}

/** Throws if any of `papers` holds a cell `column` as given could not have been filled through. */
function checkCells(column: PaperColumn, papers: readonly PaperRow[]): void {
  const { key, label, type, options } = column
  for (const row of papers) {
    const cell = row.custom[key]
    if (cell === undefined) continue
    if (type === 'multi' && !Array.isArray(cell)) throw new Error(`列「${label}」是多选列,有论文填着一段文本`)
    if (type !== 'multi' && Array.isArray(cell)) throw new Error(`列「${label}」不是多选列,有论文填着多个值`)
    if (type === 'text') continue
    const stray = cellValues(row, key).find((value) => !options.includes(value))
    if (stray !== undefined) throw new Error(`列「${label}」的选项「${stray}」还有论文在用,删不掉`)
  }
}

/**
 * Returns, in the order `columns` holds them, each custom column `row`'s cell could not have been
 * filled through, with the error checkCells throws for it; none when every cell fits. A column whose
 * cell `row` holds the same as `held` does is not checked.
 */
export function misfitCells(
  columns: PaperColumns, row: PaperRow, held: PaperRow['custom'],
): { column: PaperColumn; cause: unknown }[] {
  return columns.custom.flatMap((column) => {
    if (sameCell(ownCell(row.custom, column.key), ownCell(held, column.key))) return []
    try {
      checkCells(column, [row])
      return []
    } catch (cause) {
      return [{ column, cause }]
    }
  })
}

/**
 * Throws if `columns` breaks the rules the contract states for `papers.setColumns`. `papers`
 * are the rows the vault holds now: a column may not drop an option, or take a type, that a
 * paper's cell still contradicts.
 */
export function checkColumns(columns: PaperColumns, papers: readonly PaperRow[]): void {
  for (const key of columns.hidden) {
    if (!(PAPER_COLUMNS as readonly string[]).includes(key)) throw new Error(`不是内置列:${key}`)
    if ((LOCKED_PAPER_COLUMNS as readonly string[]).includes(key)) throw new Error(`固定列不能隐藏:${key}`)
  }
  const keys = new Set<string>()
  const labels = new Set<string>()
  for (const column of columns.custom) {
    const { key, label, type, options } = column
    if (!KEY.test(key)) throw new Error(`列的 key 只能是字母、数字、_ 与 -:${key}`)
    if (key.startsWith('-')) throw new Error(`列的 key 不能以 - 开头:${key}`)
    if (RESERVED_KEYS.has(key)) throw new Error(`列的 key 是保留字:${key}`)
    if ((PAPER_COLUMNS as readonly string[]).includes(key) || key === 't'
      || (GROUPABLE_PAPER_FIELDS as readonly string[]).includes(key)) {
      throw new Error(`列的 key 与内置列重名:${key}`)
    }
    if (keys.has(key)) throw new Error(`列的 key 重复:${key}`)
    if (label.trim() === '') throw new Error('列名不能为空')
    if (labels.has(label)) throw new Error(`列名重复:${label}`)
    if (type === 'text' && options.length > 0) throw new Error(`文本列没有选项:${label}`)
    const seen = new Set<string>()
    for (const option of options) {
      if (option.trim() === '') throw new Error(`列「${label}」的选项不能为空`)
      if (seen.has(option)) throw new Error(`列「${label}」的选项重复:${option}`)
      seen.add(option)
    }
    checkCells(column, papers)
    keys.add(key)
    labels.add(label)
  }
  for (const [at, key] of columns.groups.entries()) {
    if (columns.groups.indexOf(key) !== at) throw new Error(`分组重复:${key}`)
    checkGroupKey(key, columns)
  }
  const available = new Set<string>([...PAPER_COLUMNS, ...columns.custom.map((column) => column.key)])
  for (const [at, key] of (columns.order ?? []).entries()) {
    if (!available.has(key)) throw new Error(`列顺序里没有这一列:${key}`)
    if (columns.order?.indexOf(key) !== at) throw new Error(`列顺序重复:${key}`)
  }
}

/**
 * Throws if `patch` sets a cell the columns in `columns` could not have been filled with. Only the
 * cells `patch` sets to a value `held` does not carry are checked; a cell it empties with null, or
 * sets to the value `held` carries, passes whatever it names.
 */
export function checkCustom(
  columns: PaperColumns, patch: Record<string, PaperCell | null>, held: PaperRow['custom'],
): void {
  for (const [key, cell] of Object.entries(patch)) {
    if (cell === null) continue
    if (sameCell(cell, ownCell(held, key))) continue
    const column = columns.custom.find((c) => c.key === key)
    if (column === undefined) throw new Error(`论文表里没有这一列:${key}`)
    if (column.type === 'multi' && !Array.isArray(cell)) throw new Error(`列「${column.label}」是多选列,格子要一列取值`)
    if (column.type !== 'multi' && Array.isArray(cell)) throw new Error(`列「${column.label}」不是多选列,格子只要一个值`)
    if (column.type === 'text') continue
    const seen = new Set<string>()
    for (const value of Array.isArray(cell) ? cell : [cell]) {
      if (!column.options.includes(value)) throw new Error(`列「${column.label}」没有这个选项:${value}`)
      if (seen.has(value)) throw new Error(`列「${column.label}」的格子里有重复的选项:${value}`)
      seen.add(value)
    }
  }
}

/** Returns `held` with `patch` merged in: a null cell dropped, any other cell replaced, the rest kept as they are. */
export function patchedCustom(
  held: PaperRow['custom'], patch: Record<string, PaperCell | null>,
): PaperRow['custom'] {
  const next = { ...held }
  for (const [key, cell] of Object.entries(patch)) {
    if (cell === null) delete next[key]
    else next[key] = cell
  }
  return next
}

/**
 * Returns the options `key`'s column takes once `from` is renamed to `to`, in the order it
 * holds them. Throws if the key names no select or multi column, `from` is not one of its
 * options, or `to` is blank or already one of them.
 */
export function renamedOptions(
  columns: PaperColumns, key: string, from: string, to: string,
): string[] {
  const column = columns.custom.find((c) => c.key === key)
  if (column === undefined || column.type === 'text') throw new Error(`不是选择列:${key}`)
  if (!column.options.includes(from)) throw new Error(`列「${column.label}」没有这个选项:${from}`)
  if (to.trim() === '') throw new Error(`列「${column.label}」的选项不能为空`)
  if (column.options.includes(to)) throw new Error(`列「${column.label}」已经有这个选项:${to}`)
  return column.options.map((option) => (option === from ? to : option))
}

/** Returns `row`'s cell in `key`'s column with `from` renamed to `to`, or undefined if it holds no `from`. */
export function renamedCell(
  row: PaperRow, key: string, from: string, to: string,
): PaperCell | undefined {
  const cell = ownCell(row.custom, key)
  if (cell === undefined) return undefined
  if (!Array.isArray(cell)) return cell === from ? to : undefined
  return cell.includes(from) ? cell.map((value) => (value === from ? to : value)) : undefined
}

/**
 * Returns what retyping the custom column `key` to `type` makes of `columns` and of `papers`: the
 * columns with that column's type and options changed — and, going to text, the key dropped from
 * `groups` — and, by paper id, the cell each paper whose cell changes takes afterwards, undefined
 * where it empties. Text going to select or multi takes the distinct non-blank values `papers` hold,
 * in the order of `papers`, as its options, empties each blank cell — empty or only whitespace — and,
 * going to multi, wraps each other cell as its one value; select going to multi wraps each cell;
 * select going to text drops the options and keeps each cell; multi going to select unwraps each
 * single value and empties each empty cell; multi going to text joins each cell's values with ", ",
 * empties each empty cell and drops the options. Throws if `key` names no custom column, the column
 * already has `type`, or it goes from multi to select while some papers hold more than one value in
 * it, the message counting those papers.
 */
export function retypedColumn(
  columns: PaperColumns, papers: readonly PaperRow[], key: string, type: PaperColumn['type'],
): { columns: PaperColumns; cells: Map<string, PaperCell | undefined> } {
  const column = columns.custom.find((c) => c.key === key)
  if (column === undefined) throw new Error(`论文表里没有这一列:${key}`)
  if (column.type === type) throw new Error(`列「${column.label}」已经是${COLUMN_TYPE_LABEL[type]}列`)
  const held = papers.flatMap((row) => {
    const cell = ownCell(row.custom, key)
    if (cell === undefined) return []
    const values = Array.isArray(cell) ? cell : [cell]
    // Treat empty or whitespace-only text cells as unset: do not collect an option and clear the cell.
    return [{ id: row.id, values: column.type === 'text' ? values.filter((v) => v.trim() !== '') : values }]
  })
  if (column.type === 'multi' && type === 'select') {
    const crowded = held.filter((h) => h.values.length > 1).length
    if (crowded > 0) throw new Error(`列「${column.label}」有 ${crowded} 篇论文填着多个值,改不成单选列`)
  }
  const options = type === 'text'
    ? []
    : column.type === 'text' ? [...new Set(held.flatMap((h) => h.values))] : column.options
  const cells = new Map<string, PaperCell | undefined>()
  for (const { id, values } of held) {
    // Clear valueless cells; wrap each value when entering multiselect; collapse values when leaving it; leave all other cells unchanged.
    if (values.length === 0) cells.set(id, undefined)
    else if (type === 'multi') cells.set(id, values)
    else if (column.type === 'multi') cells.set(id, values.join(', '))
  }
  return {
    columns: {
      ...columns,
      custom: columns.custom.map((c) => (c.key === key ? { ...c, type, options } : c)),
      groups: type === 'text' ? columns.groups.filter((g) => g !== key) : columns.groups,
    },
    cells,
  }
}

/** Cells populated in column `key`, keyed by paper id; absent cells are omitted. */
export function columnCells(papers: readonly PaperRow[], key: string): Record<string, PaperCell> {
  return Object.fromEntries(papers.flatMap((row) => {
    const cell = ownCell(row.custom, key)
    return cell === undefined ? [] : [[row.id, cell] as const]
  }))
}

/**
 * Returns what putting `column` back under its key makes of `columns` and of `papers`: the columns
 * with the custom column under that key replaced by `column` — and, when `column`'s type is text, the
 * key dropped from `groups` (a text column cannot be grouped), otherwise when `groupAt` is not null
 * and `groups` lacks the key, the key put back into `groups` at `groupAt` — and, by paper id, the cell
 * each paper whose cell in it differs from `cells` takes afterwards, undefined where `cells` names
 * none for that paper. Throws if `columns` holds no custom column under that key.
 */
export function restoredColumn(
  columns: PaperColumns, papers: readonly PaperRow[], column: PaperColumn, groupAt: number | null,
  cells: Record<string, PaperCell>,
): { columns: PaperColumns; cells: Map<string, PaperCell | undefined> } {
  if (!columns.custom.some((c) => c.key === column.key)) throw new Error(`论文表里没有这一列:${column.key}`)
  const changed = new Map<string, PaperCell | undefined>()
  for (const row of papers) {
    const want = Object.hasOwn(cells, row.id) ? cells[row.id] : undefined
    if (JSON.stringify(ownCell(row.custom, column.key)) !== JSON.stringify(want)) {
      changed.set(row.id, structuredClone(want))
    }
  }
  const groups = column.type === 'text'
    ? columns.groups.filter((g) => g !== column.key)
    : groupAt === null || columns.groups.includes(column.key)
      ? columns.groups
      : [...columns.groups.slice(0, groupAt), column.key, ...columns.groups.slice(groupAt)]
  return {
    columns: { ...columns, custom: columns.custom.map((c) => (c.key === column.key ? column : c)), groups },
    cells: changed,
  }
}
